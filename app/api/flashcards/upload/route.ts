import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { contentLengthExceeds, hasImageSignature } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { reportServerError } from "@/lib/observability/server";

// Image upload for flashcard cards. Stores into the public "figures" bucket
// (same one the test importer uses) under a flashcards/ prefix and returns the
// public URL. Any signed-in member may upload (the editor is shared).
const BUCKET = "figures";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

async function ensureBucket() {
  const db = supabaseAdmin();
  const { data } = await db.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await db.storage.createBucket(BUCKET, { public: true });
    if (error && !/already exists/i.test(error.message)) throw error;
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (contentLengthExceeds(req, MAX_BYTES + 256 * 1024)) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "no_file" }, { status: 400 });

  const ext = ALLOWED[file.type];
  if (!ext) return NextResponse.json({ error: "unsupported_type" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });

  try {
    const rate = await consumeRateLimit("flashcard-image-upload", session.email, { limit: 100, windowSeconds: 24 * 60 * 60 });
    if (!rate.allowed) return NextResponse.json({ error: "rate_limit", resetsAt: rate.resetsAt }, { status: 429 });
    const db = supabaseAdmin();
    await ensureBucket();
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!hasImageSignature(buffer, file.type)) {
      return NextResponse.json({ error: "invalid_image" }, { status: 400 });
    }
    const path = `flashcards/${crypto.randomUUID()}.${ext}`;
    const { error } = await db.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: false });
    if (error) return NextResponse.json({ error: "upload_failed" }, { status: 500 });
    const url = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    return NextResponse.json({ url });
  } catch (error) {
    reportServerError("flashcards.image_upload.failed", error, {
      provider: "supabase",
      route: "/api/flashcards/upload",
      method: "POST",
    });
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
}
