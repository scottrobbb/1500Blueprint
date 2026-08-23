import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isAdminEmail } from "@/lib/auth/admin";
import { canAccessDrillPublication } from "@/lib/drills/loadDrillContent";
import { awardDrill } from "@/lib/gamification/state";
import { summarizeDrillQuestionSession } from "@/lib/drills/progress";
import { START_LIVES, WIN_TARGET } from "@/components/drills/math/mockData";

type Body = {
  clientToken?: unknown;
};

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Body | null;
  if (
    typeof body?.clientToken !== "string"
    || body.clientToken.length === 0
    || body.clientToken.length > 200
  ) {
    return NextResponse.json({ error: "A valid session token is required." }, { status: 400 });
  }

  if (!(await canAccessDrillPublication("targeted-math", isAdminEmail(session.email)))) {
    return NextResponse.json({ error: "Drill not found" }, { status: 404 });
  }

  try {
    const summary = await summarizeDrillQuestionSession(
      session.email,
      "targeted-math",
      body.clientToken,
    );
    const wrong = summary.total - summary.correct;
    if (summary.correct < WIN_TARGET && wrong < START_LIVES) {
      return NextResponse.json(
        { error: "This Targeted Math session is not complete yet." },
        { status: 409 },
      );
    }
    const award = await awardDrill(session.email, {
      drillSlug: "targeted-math",
      correct: summary.correct,
      total: summary.total,
      clientToken: body.clientToken,
    });
    return NextResponse.json({ ok: true, ...award });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const planLimit = /not included|daily limit/i.test(message);
    if (!planLimit) console.error("Targeted Math session completion failed", error);
    return NextResponse.json(
      { error: planLimit ? "Drill access is not available." : "Your session could not be saved.", code: planLimit ? "plan_limit" : "save_failed" },
      { status: planLimit ? 402 : 500 },
    );
  }
}
