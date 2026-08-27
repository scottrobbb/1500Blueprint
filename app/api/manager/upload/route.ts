import { NextResponse, type NextRequest } from "next/server";
import { getExplanationEditorSession } from "@/lib/auth/staff";
import { supabaseAdmin } from "@/utils/supabase/admin";

export const runtime = "nodejs";
const BUCKET = "course-assets";
const MAX_BYTES = 10 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

// Lets explanation editors (not just admins) paste a screenshot into an
// explanation. Same signed-upload-URL pattern as /api/admin/courses/upload,
// scoped to images only and gated by the staff role instead of admin.
export async function POST(request: NextRequest) {
  if (!(await getExplanationEditorSession())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { name?: string; type?: string; size?: number } | null;
  if (!body?.name || !body.type || !body.size || body.size <= 0) return NextResponse.json({ error: "no_file" }, { status: 400 });
  const extension = EXTENSIONS[body.type];
  if (!extension) return NextResponse.json({ error: "unsupported_type" }, { status: 400 });
  if (body.size > MAX_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });

  const storage = supabaseAdmin().storage;
  if (!(await storage.getBucket(BUCKET)).data) {
    const created = await storage.createBucket(BUCKET, { public: true });
    if (created.error && !/already exists/i.test(created.error.message)) return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
  const path = `explanations/${new Date().getUTCFullYear()}/${crypto.randomUUID()}.${extension}`;
  const bucket = storage.from(BUCKET);
  const signed = await bucket.createSignedUploadUrl(path);
  if (signed.error) return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  return NextResponse.json({ path, token: signed.data.token, url: bucket.getPublicUrl(path).data.publicUrl, name: body.name });
}
