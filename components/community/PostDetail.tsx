"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Author, CommunityPost, PostComment } from "@/lib/community/types";
import { CATEGORY } from "@/lib/community/types";
import { BackIcon, CommentIcon, EyeIcon, HeartIcon, PinIcon, ShareIcon, TrashIcon } from "./icons";
import { Avatar } from "./Avatar";
import { Attachment } from "./Attachment";
import { PostMenu } from "./PostMenu";
import { RichText } from "./RichText";
import { createClient } from "@/utils/supabase/client";

type RealtimeChannel = ReturnType<ReturnType<typeof createClient>["channel"]>;

// Ephemeral (not persisted) "someone is typing" indicator, broadcast over a
// Supabase Realtime channel scoped to this post. Deliberately uses Broadcast
// rather than postgres_changes: community_comments has no anon RLS policies
// (service-role-only by design), and Broadcast doesn't need any.
function typingLabel(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return "Several people are typing…";
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      <span className="h-1 w-1 animate-bounce rounded-full bg-navy/40" style={{ animationDelay: "0ms" }} />
      <span className="h-1 w-1 animate-bounce rounded-full bg-navy/40" style={{ animationDelay: "120ms" }} />
      <span className="h-1 w-1 animate-bounce rounded-full bg-navy/40" style={{ animationDelay: "240ms" }} />
    </span>
  );
}

// Who a reply composer is aimed at: always threads under a ROOT comment (one
// level deep); `handle` is who gets the @mention prefill.
type ReplyTarget = { rootId: string; handle: string };

function ReplyComposer({
  user,
  target,
  onSubmit,
  onCancel,
  onTyping,
  posting,
}: {
  user: Author;
  target: ReplyTarget;
  onSubmit: (body: string) => Promise<string | null>;
  onCancel: () => void;
  onTyping: () => void;
  posting: boolean;
}) {
  const [draft, setDraft] = useState(`@${target.handle} `);
  const [error, setError] = useState("");

  async function submit() {
    const message = await onSubmit(draft);
    setError(message ?? "");
  }

  return (
    <div className="mt-2 flex items-start gap-2">
      <Avatar src={user.avatarUrl} initials={user.initials} size={26} />
      <div className="flex-1">
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setError(""); onTyping(); }}
          rows={2}
          placeholder={`Reply to @${target.handle}…`}
          // Put the caret after the prefilled mention on mount.
          onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
          className="w-full resize-none rounded-lg bg-haze px-3 py-2 text-[13.5px] leading-[1.55] text-ink outline-none ring-brand/40 transition-shadow placeholder:text-navy/40 focus:ring-2"
        />
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-[12px] font-semibold text-danger">{error}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-navy/60 transition-colors hover:bg-navy/[0.06]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!draft.trim() || posting}
              className="rounded-lg bg-brand px-3.5 py-1.5 text-[12.5px] font-bold text-white shadow-[0_2px_0_#2b8fe0] transition-transform active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {posting ? "Replying…" : "Reply"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CommentBody({
  comment,
  size,
  canModerate,
  onDelete,
  onReply,
}: {
  comment: PostComment;
  size: number;
  canModerate: boolean;
  onDelete: (id: string) => void;
  onReply: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/community/comments/${comment.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      onDelete(comment.id);
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className={`group flex gap-2.5 ${busy ? "opacity-50" : ""}`}>
      <Avatar src={comment.author.avatarUrl} initials={comment.author.initials} alt={comment.author.name} size={size} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 leading-tight">
          <span className="text-[13.5px] font-bold text-ink">{comment.author.name}</span>
          <span className="text-[12px] text-navy/45">
            @{comment.author.handle} · {comment.timeAgo}
          </span>
          {canModerate && (
            <button
              type="button"
              onClick={remove}
              aria-label="Delete comment"
              className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-full text-navy/30 transition-colors hover:bg-danger-bg hover:text-danger sm:opacity-0 sm:group-hover:opacity-100"
            >
              <TrashIcon className="h-[15px] w-[15px]" />
            </button>
          )}
        </div>
        <RichText text={comment.body} className="mt-1 text-[14px] leading-[1.55] text-ink/85" />
        <button
          type="button"
          onClick={onReply}
          className="mt-1 text-[12px] font-bold text-navy/45 transition-colors hover:text-navy"
        >
          Reply
        </button>
      </div>
    </div>
  );
}

export function PostDetail({
  post,
  user,
  isAdmin,
  backHref = "/community",
}: {
  post: CommunityPost;
  user: Author;
  isAdmin: boolean;
  backHref?: string;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.likes);
  const [comments, setComments] = useState<PostComment[]>(post.comments ?? []);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [pinned, setPinned] = useState(post.pinned);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const [commentError, setCommentError] = useState("");
  const cat = CATEGORY[post.category];
  const canModeratePost = isAdmin || post.authorHandle === user.handle;

  const supabase = useMemo(() => createClient(), []);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastTypingSentRef = useRef(0);

  useEffect(() => {
    const channel = supabase.channel(`post:${post.id}:typing`, { config: { broadcast: { self: false } } });
    channelRef.current = channel;
    const timeouts = typingTimeoutsRef.current;

    function clearTypingFor(handle: string) {
      const timeout = timeouts.get(handle);
      if (timeout) { clearTimeout(timeout); timeouts.delete(handle); }
      setTypingUsers((current) => {
        if (!current.has(handle)) return current;
        const next = new Map(current);
        next.delete(handle);
        return next;
      });
    }

    channel
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const handle = typeof payload?.handle === "string" ? payload.handle : null;
        const name = typeof payload?.name === "string" ? payload.name : null;
        if (!handle || !name || handle === user.handle) return;
        setTypingUsers((current) => new Map(current).set(handle, name));
        const existing = typingTimeoutsRef.current.get(handle);
        if (existing) clearTimeout(existing);
        // Fallback expiry in case a stopped_typing event never arrives
        // (tab closed, network drop) -- keeps the indicator from sticking.
        timeouts.set(handle, setTimeout(() => clearTypingFor(handle), 3000));
      })
      .on("broadcast", { event: "stopped_typing" }, ({ payload }) => {
        const handle = typeof payload?.handle === "string" ? payload.handle : null;
        if (handle) clearTypingFor(handle);
      })
      .subscribe();

    return () => {
      for (const timeout of timeouts.values()) clearTimeout(timeout);
      timeouts.clear();
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [supabase, post.id, user.handle]);

  function broadcastTyping() {
    const now = Date.now();
    if (now - lastTypingSentRef.current < 2000) return;
    lastTypingSentRef.current = now;
    void channelRef.current?.send({ type: "broadcast", event: "typing", payload: { handle: user.handle, name: user.name } });
  }

  function broadcastStoppedTyping() {
    lastTypingSentRef.current = 0;
    void channelRef.current?.send({ type: "broadcast", event: "stopped_typing", payload: { handle: user.handle } });
  }

  // One-level threads: top-level comments in order, replies grouped under them.
  const thread = useMemo(() => {
    const roots = comments.filter((c) => !c.parentId);
    const replies = new Map<string, PostComment[]>();
    for (const c of comments) {
      if (!c.parentId) continue;
      const list = replies.get(c.parentId) ?? [];
      list.push(c);
      replies.set(c.parentId, list);
    }
    return { roots, replies };
  }, [comments]);

  async function toggleLike() {
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    try {
      const res = await fetch(`/api/community/posts/${post.id}/like`, { method: "POST" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { liked: boolean; likes: number };
      setLiked(Boolean(data.liked));
      setLikes(Number(data.likes));
    } catch {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
    }
  }

  // Returns an error message on failure (so root vs. reply composers can each
  // show it in the right place), or null on success.
  async function submitComment(body: string, parentId: string | null): Promise<string | null> {
    const text = body.trim();
    if (!text || posting) return null;
    setPosting(true);
    if (!parentId) setCommentError("");
    try {
      const res = await fetch(`/api/community/posts/${post.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, parentId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error === "blocked_content" ? "blocked_content" : "create");
      }
      const { comment } = (await res.json()) as { comment: PostComment };
      setComments((prev) => [...prev, comment]);
      broadcastStoppedTyping();
      if (parentId) setReplyTo(null);
      else setDraft("");
      return null;
    } catch (err) {
      // On any failure the draft is left in place so nothing is lost.
      const message = err instanceof Error && err.message === "blocked_content" ? "That comment contains language that isn't allowed here." : "";
      if (!parentId) setCommentError(message);
      return message;
    } finally {
      setPosting(false);
    }
  }

  // Deleting a root also removes its replies locally (the DB cascades).
  function removeComment(id: string) {
    setComments((prev) => prev.filter((c) => c.id !== id && c.parentId !== id));
  }

  async function deletePost() {
    try {
      const res = await fetch(`/api/community/posts/${post.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      router.push(backHref);
      router.refresh();
    } catch {
      // no-op; the post stays on screen
    }
  }

  async function togglePin() {
    try {
      const res = await fetch(`/api/community/posts/${post.id}/pin`, { method: "POST" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { pinned: boolean };
      setPinned(data.pinned);
    } catch {
      // no-op; badge keeps showing the prior pinned state
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Link
        href={backHref}
        className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-navy/60 transition-colors hover:text-navy"
      >
        <BackIcon className="h-4 w-4" />
        Back to community
      </Link>

      <article
        className={`rounded-2xl border bg-white p-4 shadow-[0_2px_10px_rgba(11,42,91,0.06)] sm:p-5 ${
          pinned ? "border-navy/15 border-t-2 border-t-gold" : "border-navy/10"
        }`}
      >
        <header className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Avatar
              src={post.author.avatarUrl}
              initials={post.author.initials}
              alt={post.author.name}
              size={42}
              level={post.author.level}
            />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[15px] font-bold text-ink">{post.author.name}</div>
              <div className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-navy/45">
                {post.timeAgo}
                <span className="h-1 w-1 flex-none rounded-full bg-navy/25" />
                <span className={`h-1.5 w-1.5 flex-none rounded-full ${cat.dot}`} />
                {cat.label}
              </div>
            </div>
          </div>

          <div className="flex flex-none items-center gap-2.5">
            {pinned && (
              <span className="inline-flex items-center gap-1 text-[12px] font-bold text-gold-600">
                <PinIcon className="h-3.5 w-3.5" />
                Pinned
              </span>
            )}
            <PostMenu
              canDelete={canModeratePost}
              onDelete={deletePost}
              isAdmin={isAdmin}
              pinned={pinned}
              onTogglePin={togglePin}
            />
          </div>
        </header>

        {post.title ? <h1 className="mt-3 font-display text-xl font-extrabold text-ink">{post.title}</h1> : null}
        <RichText text={post.body} className="mt-2 text-[15px] leading-[1.65] text-ink/90" />
        {post.shot && <Attachment shot={post.shot} variant="full" />}

        <div className="mt-4 flex items-center gap-2 border-t border-navy/[0.07] pt-3">
          <button
            type="button"
            onClick={toggleLike}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
              liked ? "border-danger/25 bg-danger-bg text-danger" : "border-navy/12 text-navy/60 hover:bg-navy/[0.04]"
            }`}
          >
            <HeartIcon className="h-[17px] w-[17px]" filled={liked} />
            {likes}
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-navy/12 px-3.5 py-1.5 text-[13px] font-semibold text-navy/60">
            <CommentIcon className="h-[17px] w-[17px]" />
            {comments.length}
          </span>
          <div className="ml-auto flex items-center gap-3 text-navy/40">
            <span className="inline-flex items-center gap-1 text-[12.5px] font-medium">
              <EyeIcon className="h-4 w-4" />
              {post.views}
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] font-semibold text-navy/55 transition-colors hover:bg-navy/[0.04] hover:text-navy"
            >
              <ShareIcon className="h-[17px] w-[17px]" />
              Share
            </button>
          </div>
        </div>
      </article>

      <div className="rounded-2xl border border-navy/10 bg-white p-4 shadow-[0_2px_10px_rgba(11,42,91,0.06)]">
        <div className="flex items-center justify-between border-b border-navy/[0.07] pb-3">
          <h2 className="font-display text-[15px] font-bold text-navy">
            {comments.length} {comments.length === 1 ? "comment" : "comments"}
          </h2>
          <span className="text-[12.5px] font-semibold text-navy/45">Newest</span>
        </div>

        <div className="flex items-start gap-2.5 pt-3">
          <Avatar src={user.avatarUrl} initials={user.initials} size={34} />
          <div className="flex-1">
            <textarea
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setCommentError(""); broadcastTyping(); }}
              rows={2}
              placeholder="Add a comment…"
              className="w-full resize-none rounded-lg bg-haze px-3.5 py-2.5 text-[14px] leading-[1.55] text-ink outline-none ring-brand/40 transition-shadow placeholder:text-navy/40 focus:ring-2"
            />
            <div className="mt-2 flex items-center justify-between">
              {commentError ? (
                <span className="text-[12px] font-semibold text-danger">{commentError}</span>
              ) : (
                <span className="flex min-h-4 items-center gap-1.5 text-[12px] font-semibold text-navy/45">
                  {typingUsers.size > 0 && (
                    <>
                      <TypingDots />
                      {typingLabel(Array.from(typingUsers.values()))}
                    </>
                  )}
                </span>
              )}
              <button
                type="button"
                onClick={() => void submitComment(draft, null)}
                disabled={!draft.trim() || posting}
                className="rounded-lg bg-brand px-4 py-2 text-[13px] font-bold text-white shadow-[0_2px_0_#2b8fe0] transition-transform active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              >
                {posting ? "Posting…" : "Comment"}
              </button>
            </div>
          </div>
        </div>

        {thread.roots.length > 0 && (
          <div className="mt-1 divide-y divide-navy/[0.07] border-t border-navy/[0.07]">
            {thread.roots.map((c) => {
              const replies = thread.replies.get(c.id) ?? [];
              return (
                <div key={c.id} className="py-3.5">
                  <CommentBody
                    comment={c}
                    size={34}
                    canModerate={isAdmin || c.authorHandle === user.handle}
                    onDelete={removeComment}
                    onReply={() => setReplyTo({ rootId: c.id, handle: c.author.handle })}
                  />

                  {/* Replies: indented under the root with a thread line. */}
                  {(replies.length > 0 || replyTo?.rootId === c.id) && (
                    <div className="ml-[17px] mt-2.5 flex flex-col gap-3 border-l-2 border-navy/[0.08] pl-[22px]">
                      {replies.map((r) => (
                        <CommentBody
                          key={r.id}
                          comment={r}
                          size={26}
                          canModerate={isAdmin || r.authorHandle === user.handle}
                          onDelete={removeComment}
                          onReply={() => setReplyTo({ rootId: c.id, handle: r.author.handle })}
                        />
                      ))}
                      {replyTo?.rootId === c.id && (
                        <ReplyComposer
                          user={user}
                          target={replyTo}
                          posting={posting}
                          onSubmit={(body) => submitComment(body, c.id)}
                          onCancel={() => setReplyTo(null)}
                          onTyping={broadcastTyping}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
