// Single-module practice completion. The module runner POSTs here on its results
// screen; we recompute the raw score SERVER-SIDE from the answer map (so the
// client can't inflate it) and store the attempt for history. Idempotent on
// clientToken.

import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { loadTest } from "@/lib/sat/loadTest";
import { getModuleByKey } from "@/lib/sat/modules";
import { isCorrect } from "@/lib/sat/scoring";
import { saveModuleAttempt } from "@/lib/sat/moduleAttempts";
import type { AnswerMap } from "@/lib/sat/types";
import { isAdminEmail } from "@/lib/auth/admin";
import { canAccessPracticeTest } from "@/lib/auth/access-control";

type Body = {
  testSlug?: string;
  moduleKey?: string;
  answers?: AnswerMap;
  perQuestionTime?: Record<string, number>;
  clientToken?: string;
};

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const { testSlug, moduleKey } = body;
  if (!testSlug || !moduleKey) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  const isAdmin = isAdminEmail(session.email);
  if (!isAdmin && !(await canAccessPracticeTest(session.email, testSlug))) {
    return NextResponse.json({ error: "plan_limit" }, { status: 402 });
  }
  const test = await loadTest(testSlug, { includeDraft: isAdmin });
  if (!test) return NextResponse.json({ error: "test_not_found" }, { status: 404 });
  const found = getModuleByKey(test, moduleKey);
  if (!found) return NextResponse.json({ error: "module_not_found" }, { status: 404 });

  const answers = body.answers ?? {};
  const correct = found.module.questions.reduce(
    (n, q) => n + (isCorrect(q, answers[q.id]) ? 1 : 0),
    0,
  );
  const total = found.module.questions.length;

  try {
    const id = await saveModuleAttempt(session.email, {
      testSlug,
      moduleKey,
      label: found.meta.fullLabel,
      correct,
      total,
      answers,
      perQuestionTime: body.perQuestionTime ?? {},
      moduleSnapshot: { meta: found.meta, module: found.module },
      clientToken: body.clientToken,
    });
    return NextResponse.json({ attemptId: id, correct, total });
  } catch (e) {
    console.error("module attempt save failed:", e);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
}
