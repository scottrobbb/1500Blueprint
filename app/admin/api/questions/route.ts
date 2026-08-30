import { NextResponse, type NextRequest } from "next/server";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { createQuestion, listQuestions, type QuestionFilters } from "@/lib/drills/admin-queries";
import type { Difficulty } from "@/lib/sat/types";
import type { AnswerType, DrillSlug, QuestionStatus, SatSection } from "@/lib/drills/types";
import { readJsonBody } from "@/lib/security/request";

const FORBIDDEN = NextResponse.json({ error: "forbidden" }, { status: 403 });

// A blank/whitespace query param is treated as "no filter" so empty form fields
// don't accidentally pin the list to "".
function param(params: URLSearchParams, key: string): string | undefined {
  const raw = params.get(key)?.trim();
  return raw ? raw : undefined;
}

function toInt(value: string | undefined, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : fallback;
}

// GET /admin/api/questions — filtered + paginated question bank list.
export async function GET(req: NextRequest) {
  if (!(await getAdminSession())) return FORBIDDEN;

  const params = req.nextUrl.searchParams;
  // The query layer applies these as exact .eq() matches; passing the raw string
  // through as the union type is safe because an unknown value simply matches no
  // rows. Casting avoids `any` while keeping the narrow filter shape.
  const filters: QuestionFilters = {
    drillSlug: param(params, "drillSlug") as DrillSlug | undefined,
    difficulty: param(params, "difficulty") as Difficulty | "challenge" | undefined,
    answerType: param(params, "answerType") as AnswerType | undefined,
    status: param(params, "status") as QuestionStatus | undefined,
    section: param(params, "section") as SatSection | undefined,
    skill: param(params, "skill"),
    search: param(params, "search"),
  };

  const page = toInt(param(params, "page"), 1, 100_000);
  const pageSize = toInt(param(params, "pageSize"), 25, 100);

  const { questions, total } = await listQuestions(filters, page, pageSize);
  return NextResponse.json({ questions, total });
}

// POST /admin/api/questions — insert a blank draft for { drillSlug }.
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return FORBIDDEN;

  let drillSlug = "";
  let visibleInDrill = true;
  try {
    const body = await readJsonBody(req, 16 * 1024) as Record<string, unknown>;
    drillSlug = String(body?.drillSlug ?? "").trim();
    if (typeof body?.visibleInDrill === "boolean") visibleInDrill = body.visibleInDrill;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!drillSlug) {
    return NextResponse.json({ error: "drillSlug required" }, { status: 400 });
  }

  const question = await createQuestion(drillSlug as DrillSlug, session.email, { visibleInDrill });
  if (!question) {
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
  return NextResponse.json(question, { status: 201 });
}
