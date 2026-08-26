"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { createClient } from "@/utils/supabase/client";

const ACCEPT: Record<"video" | "image" | "audio" | "file", string> = {
  video: "video/mp4,video/webm,video/quicktime",
  image: "image/png,image/jpeg,image/gif,image/webp",
  audio: "audio/mpeg,audio/mp4,audio/wav",
  file: ".pdf,.zip,.txt,.docx,.pptx,.xlsx,image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp4,audio/wav",
};

export function CourseAssetUpload({ kind, onUploaded, compact = false }: { kind: "video" | "image" | "audio" | "file"; onUploaded: (url: string, name: string) => void; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 500 * 1024 * 1024) { setError("Files must be under 500 MB."); return; }
    setUploading(true);
    setError(null);
    const response = await fetch("/api/admin/courses/upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
    });
    const signed = (await response.json().catch(() => null)) as { path?: string; token?: string; url?: string; name?: string; error?: string } | null;
    if (!response.ok || !signed?.path || !signed.token || !signed.url) {
      setUploading(false);
      setError(signed?.error === "unsupported_type" ? "That file type is not supported." : "Upload could not be started.");
      return;
    }
    const uploaded = await createClient().storage.from("course-assets").uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type, cacheControl: "31536000" });
    setUploading(false);
    if (uploaded.error) { setError("Upload failed. Try again."); return; }
    onUploaded(signed.url, signed.name ?? file.name);
  }

  return (
    <div className={compact ? "mt-2" : "mt-3"}>
      <input ref={input} type="file" accept={ACCEPT[kind]} onChange={upload} className="hidden" />
      <button type="button" onClick={() => input.current?.click()} disabled={uploading} className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-brand/25 bg-ice px-3 text-xs font-extrabold text-brand-700 transition-colors hover:border-brand/45 hover:bg-brand/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-wait disabled:opacity-60">
        <UploadIcon /> {uploading ? "Uploading…" : `Upload ${kind}`}
      </button>
      <span className="ml-2 text-[10px] font-semibold text-navy/35">Up to 500 MB</span>
      {error ? <p role="alert" className="mt-2 text-xs font-semibold text-danger-600">{error}</p> : null}
    </div>
  );
}

function UploadIcon() {
  return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" strokeLinecap="round" /></svg>;
}
