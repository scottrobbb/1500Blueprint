import { NextResponse, type NextRequest } from "next/server";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { isSameOriginRequest, readJsonBody, RequestBodyTooLargeError } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
const BUCKET = "course-assets";
const MAX_BYTES = 500 * 1024 * 1024;
const MAX_COVER_BYTES = 10 * 1024 * 1024;
const MAX_REQUEST_BYTES = 8 * 1024;
const COURSE_ASSET_PATH = /^(?:covers|lessons)\/\d{4}\/[0-9a-f-]+\.[a-z0-9]+$/i;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const EXTENSIONS: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp",
  "application/pdf": "pdf", "application/zip": "zip", "text/plain": "txt",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
  "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/wav": "wav",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

export async function POST(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let body: { name?: string; type?: string; size?: number; purpose?: "lesson" | "cover" } | null;
  try {
    body = await readJsonBody(request, MAX_REQUEST_BYTES) as typeof body;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof RequestBodyTooLargeError ? "too_large" : "invalid_body" },
      { status: error instanceof RequestBodyTooLargeError ? 413 : 400 },
    );
  }
  if (
    !body
    || typeof body.name !== "string"
    || body.name.length === 0
    || body.name.length > 255
    || typeof body.type !== "string"
    || typeof body.size !== "number"
    || !Number.isSafeInteger(body.size)
    || body.size <= 0
  ) return NextResponse.json({ error: "no_file" }, { status: 400 });
  const purpose = body.purpose ?? "lesson";
  if (purpose !== "lesson" && purpose !== "cover") return NextResponse.json({ error: "invalid_purpose" }, { status: 400 });
  if (purpose === "cover" && !IMAGE_TYPES.has(body.type)) return NextResponse.json({ error: "unsupported_type" }, { status: 400 });
  if (body.size > (purpose === "cover" ? MAX_COVER_BYTES : MAX_BYTES)) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const extension = EXTENSIONS[body.type];
  if (!extension) return NextResponse.json({ error: "unsupported_type" }, { status: 400 });
  try {
    const rate = await consumeRateLimit("admin-signed-upload", session.email, { limit: 120, windowSeconds: 60 * 60 });
    if (!rate.allowed) return NextResponse.json({ error: "rate_limit", resetsAt: rate.resetsAt }, { status: 429 });
  } catch {
    return NextResponse.json({ error: "temporarily_unavailable" }, { status: 503 });
  }
  const storage = supabaseAdmin().storage;
  if (!(await storage.getBucket(BUCKET)).data) {
    const created = await storage.createBucket(BUCKET, { public: false });
    if (created.error && !/already exists/i.test(created.error.message)) return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
  const path = `${purpose === "cover" ? "covers" : "lessons"}/${new Date().getUTCFullYear()}/${crypto.randomUUID()}.${extension}`;
  const bucket = storage.from(BUCKET);
  const signed = await bucket.createSignedUploadUrl(path);
  if (signed.error) return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  return NextResponse.json({ path, token: signed.data.token, url: bucket.getPublicUrl(path).data.publicUrl, name: body.name });
}

export async function GET(request: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const path = request.nextUrl.searchParams.get("path");
  if (!path || !COURSE_ASSET_PATH.test(path)) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  }
  const signed = await supabaseAdmin().storage.from(BUCKET).createSignedUrl(path, 4 * 60 * 60);
  if (signed.error || !signed.data.signedUrl) {
    return NextResponse.json({ error: "preview_failed" }, { status: 500 });
  }
  return NextResponse.json({ url: signed.data.signedUrl });
}
