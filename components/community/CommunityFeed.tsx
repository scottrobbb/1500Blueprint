"use client";

import { useMemo, useRef, useState } from "react";
import type { Author, CommunityCategory, CommunityPost } from "@/lib/community/types";
import { CATEGORY, CATEGORY_ORDER } from "@/lib/community/types";
import { ImageIcon } from "./icons";
import { Avatar } from "./Avatar";
import { PostCard } from "./PostCard";

type Filter = CommunityCategory | "all";

// Pinned posts float to the top; filter preserves relative order otherwise.
function withPinnedFirst(posts: CommunityPost[]): CommunityPost[] {
  return [...posts.filter((p) => p.pinned), ...posts.filter((p) => !p.pinned)];
}

// Pull the first image out of a paste or drop (clipboard screenshots arrive as
// image/png). Index-based loop — DataTransferItemList isn't iterable.
function imageFromTransfer(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i];
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const f = item.getAsFile();
      if (f) return f;
    }
  }
  return null;
}

// The resting + expanded composer. Uploads the screenshot first (if any), then
// creates the post; the created row (with its real id + counts) is handed back
// to the feed to prepend.
function Composer({ user, onCreated, variant = "default" }: { user: Author; onCreated: (post: CommunityPost) => void; variant?: "default" | "ultimate" }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [category, setCategory] = useState<CommunityCategory>("general");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  function reset() {
    setText("");
    setCategory("general");
    clearFile();
    setError("");
    setOpen(false);
  }

  function pickFile(f: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  function clearFile() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  // Paste/drop an image straight into the post. Returns true if one was taken,
  // so the handler can preventDefault (and skip pasting the image as junk text).
  function takeImageFrom(data: DataTransfer | null): boolean {
    const img = imageFromTransfer(data);
    if (!img) return false;
    pickFile(img);
    return true;
  }

  async function submit() {
    if ((!text.trim() && !file) || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      let imageUrl: string | null = null;
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        const up = await fetch("/api/community/upload", { method: "POST", body: fd });
        if (!up.ok) throw new Error("upload");
        imageUrl = ((await up.json()) as { url: string }).url;
      }
      const res = await fetch("/api/community/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, body: text.trim(), imageUrl }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error === "blocked_content" ? "blocked_content" : "create");
      }
      const { post } = (await res.json()) as { post: CommunityPost };
      onCreated(post);
      reset();
    } catch (err) {
      setError(err instanceof Error && err.message === "blocked_content" ? "That post contains language that isn't allowed here." : "Could not post. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <div className={`flex items-center gap-2.5 border border-navy/10 bg-white p-3 ${variant === "ultimate" ? "rounded-2xl shadow-pop" : "rounded-xl"}`}>
        <Avatar src={user.avatarUrl} initials={user.initials} size={38} />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex-1 rounded-full bg-haze px-4 py-2.5 text-left text-[14px] text-navy/45 transition-colors hover:bg-navy/[0.07]"
        >
          Share a win, a question, or a score screenshot…
        </button>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Attach a screenshot"
          className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-full text-navy/50 transition-colors hover:bg-navy/[0.06] hover:text-navy"
        >
          <ImageIcon className="h-[21px] w-[21px]" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`${variant === "ultimate" ? "rounded-2xl shadow-pop" : "rounded-xl"} border border-navy/10 bg-white p-3.5`}
      onDrop={(e) => {
        if (takeImageFrom(e.dataTransfer)) e.preventDefault();
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
    >
      <div className="flex items-start gap-2.5">
        <Avatar src={user.avatarUrl} initials={user.initials} size={38} />
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            if (takeImageFrom(e.clipboardData)) e.preventDefault();
          }}
          rows={4}
          placeholder="What do you want to share with the community?"
          className="min-h-[92px] flex-1 resize-none rounded-lg bg-haze px-3.5 py-3 text-[14px] leading-[1.6] text-ink outline-none ring-brand/40 transition-shadow placeholder:text-navy/40 focus:ring-2"
        />
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
      />

      {preview ? (
        <div className="relative mt-3 inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Selected screenshot preview" width={800} height={600} className="h-auto max-h-52 rounded-lg border border-navy/12" />
          <button
            type="button"
            onClick={clearFile}
            aria-label="Remove screenshot"
            className="absolute -right-2 -top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-navy text-white shadow-md"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-navy/20 bg-haze/60 py-2.5 text-[13px] font-semibold text-navy/55 transition-colors hover:border-brand/50 hover:text-navy"
        >
          <ImageIcon className="h-[18px] w-[18px]" />
          Add a screenshot, or paste or drop it in
        </button>
      )}

      {error && <p className="mt-2.5 text-[13px] font-medium text-danger">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <select
          aria-label="Post category"
          value={category}
          onChange={(e) => setCategory(e.target.value as CommunityCategory)}
          className="rounded-lg border border-navy/15 bg-white px-3 py-2 text-[13px] font-semibold text-navy outline-none focus:border-brand"
        >
          {CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>
              {CATEGORY[c].label}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg px-4 py-2 text-[13px] font-semibold text-navy/60 transition-colors hover:bg-navy/[0.06]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={(!text.trim() && !file) || submitting}
            className="rounded-lg bg-brand px-5 py-2 text-sm font-bold text-white shadow-[0_2px_0_#2b8fe0] transition-transform active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {submitting ? "Posting…" : "Post"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterChips({ value, onChange }: { value: Filter; onChange: (f: Filter) => void }) {
  const chips: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    ...CATEGORY_ORDER.map((c) => ({ key: c as Filter, label: CATEGORY[c].label })),
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) => {
        const active = value === c.key;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onChange(c.key)}
            aria-pressed={active}
            className={`rounded-full border px-3 py-1 text-[13px] font-semibold transition-colors ${
              active
                ? "border-navy bg-navy text-white"
                : "border-navy/12 bg-white text-navy/60 hover:bg-navy/[0.05] hover:text-navy"
            }`}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

export function CommunityFeed({
  initialPosts,
  user,
  isAdmin,
  threadHrefBase = "/community",
  variant = "default",
}: {
  initialPosts: CommunityPost[];
  user: Author;
  isAdmin: boolean;
  threadHrefBase?: string;
  variant?: "default" | "ultimate";
}) {
  const [posts, setPosts] = useState(initialPosts);
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(
    () => (filter === "all" ? posts : posts.filter((p) => p.category === filter)),
    [posts, filter],
  );

  return (
    <div className="flex flex-col gap-3">
      <Composer user={user} variant={variant} onCreated={(p) => setPosts((prev) => withPinnedFirst([p, ...prev]))} />
      <div className={variant === "ultimate" ? "rounded-2xl border border-navy/10 bg-white p-3 shadow-pop" : "py-0.5"}>
        <FilterChips value={filter} onChange={setFilter} />
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-navy/15 bg-white px-6 py-14 text-center">
          <p className="font-display text-lg font-bold text-navy">
            {posts.length === 0 ? "No posts yet" : "Nothing in this filter"}
          </p>
          <p className="mt-1 text-sm text-navy/55">
            {posts.length === 0
              ? "Be the first to share a win, a question, or a score screenshot."
              : `No posts in ${filter === "all" ? "the community" : CATEGORY[filter].label} yet.`}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUser={user}
              isAdmin={isAdmin}
              threadHrefBase={threadHrefBase}
              onDelete={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
              onPinChange={(id, pinned) =>
                setPosts((prev) => withPinnedFirst(prev.map((p) => (p.id === id ? { ...p, pinned } : p))))
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
