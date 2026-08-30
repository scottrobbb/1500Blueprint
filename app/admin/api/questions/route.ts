import { NextResponse, type NextRequest } from "next/server";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { createQuestion, listQuestions, parseQuestionFilters } from "@/lib/drills/admin-queries";
import type { DrillSlug } from "@/lib/drills/types";
import { readJsonBody } from "@/lib/security/request";

const FORBIDDEN = NextResponse.json({ error: "forbidden" }, { status: 403 });

// GET /admin/api/questions — filtered + paginated question bank list.
export async function GET(req: NextRequest) {
  if (!(await getAdminSession())) return FORBIDDEN;

  const { filters, page, pageSize } = parseQuestionFilters(req.nextUrl.searchParams);
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
