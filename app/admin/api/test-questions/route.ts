import { NextResponse, type NextRequest } from "next/server";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { createTestQuestion } from "@/lib/sat/admin-queries";
import { readJsonBody } from "@/lib/security/request";

// Create a blank practice-test question in a module. Separate namespace from the
// drill CMS's /admin/api/questions so the two editors never collide.
const forbidden = () => NextResponse.json({ error: "forbidden" }, { status: 403 });

// POST /admin/api/test-questions — append a blank question to { moduleId }.
export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return forbidden();

  let moduleId = "";
  try {
    const body = await readJsonBody(req, 16 * 1024) as Record<string, unknown>;
    moduleId = String(body?.moduleId ?? "").trim();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!moduleId) return NextResponse.json({ error: "moduleId required" }, { status: 400 });

  const question = await createTestQuestion(moduleId);
  if (!question) return NextResponse.json({ error: "create failed" }, { status: 500 });
  return NextResponse.json(question, { status: 201 });
}
