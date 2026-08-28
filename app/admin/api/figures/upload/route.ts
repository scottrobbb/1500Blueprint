import { NextResponse, type NextRequest } from "next/server";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { contentLengthExceeds, hasImageSignature } from "@/lib/security/request";
import { reportServerError } from "@/lib/observability/server";

export const runtime = "nodejs";

const BUCKET = "figures";
// Vercel Functions cap request bodies at 4.5 MB. Keep room for multipart metadata.
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

async function ensureBucket() {
  const storage = supabaseAdmin().storage;
  const { data } = await storage.getBucket(BUCKET);
  if (data) return;

  const { error } = await storage.createBucket(BUCKET, { public: true });
  if (error && !/already exists/i.test(error.message)) throw error;
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (contentLengthExceeds(req, MAX_BYTES + 256 * 1024)) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get("file");
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }

  const extension = ALLOWED_TYPES[file.type];
  if (!extension) {
    return NextResponse.json({ error: "unsupported_type" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  try {
    await ensureBucket();
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!hasImageSignature(buffer, file.type)) {
      return NextResponse.json({ error: "invalid_image" }, { status: 400 });
    }
    const storage = supabaseAdmin().storage.from(BUCKET);
    const path = `admin/${crypto.randomUUID()}.${extension}`;
    const { error } = await storage.upload(path, buffer, {
      cacheControl: "31536000",
      contentType: file.type,
      upsert: false,
    });
    if (error) throw error;

    return NextResponse.json({ url: storage.getPublicUrl(path).data.publicUrl });
  } catch (error) {
    reportServerError("admin.figure_upload.failed", error, {
      provider: "supabase",
      route: "/admin/api/figures/upload",
      method: "POST",
    });
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
}
