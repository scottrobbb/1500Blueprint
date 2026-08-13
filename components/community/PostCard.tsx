"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Author, CommunityPost } from "@/lib/community/types";
import { CATEGORY } from "@/lib/community/types";
import { CommentIcon, HeartIcon, PinIcon } from "./icons";
import { Avatar } from "./Avatar";
import { AvatarStack } from "./AvatarStack";
import { Attachment } from "./Attachment";
import { PostMenu } from "./PostMenu";
import { RichText } from "./RichText";

export function PostCard({
  post,
  currentUser,
  isAdmin = false,
  onDelete,
  onPinChange,
}: {
  post: CommunityPost;
  currentUser: Author;
  isAdmin?: boolean;
  onDelete?: (id: string) => void;
  onPinChange?: (id: string, pinned: boolean) => void;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.likes);
  const [pinned, setPinned] = useState(post.pinned);
  const [busy, setBusy] = useState(false);
  const cat = CATEGORY[post.category];
  const canDelete = isAdmin || post.authorHandle === currentUser.handle;

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

  async function togglePin() {
    try {
      const res = await fetch(`/api/community/posts/${post.id}/pin`, { method: "POST" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { pinned: boolean };
      setPinned(data.pinned);
      onPinChange?.(post.id, data.pinned);
    } catch {
      // no-op; card keeps showing its prior pinned state
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/community/posts/${post.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      onDelete?.(post.id);
    } catch {
      setBusy(false);
    }
  }

  return (
    <article
      className={`rounded-2xl border bg-white shadow-[0_2px_10px_rgba(11,42,91,0.06)] transition-colors ${
        pinned ? "border-navy/15 border-t-2 border-t-gold hover:border-gold/50" : "border-navy/10 hover:border-navy/[0.16]"
      } ${busy ? "pointer-events-none opacity-50" : ""}`}
    >
      <div className="px-4 pt-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Avatar
              src={post.author.avatarUrl}
              initials={post.author.initials}
              alt={post.author.name}
              size={38}
              level={post.author.level}
            />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[14px] font-bold text-ink">{post.author.name}</div>
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
            <PostMenu canDelete={canDelete} onDelete={remove} isAdmin={isAdmin} pinned={pinned} onTogglePin={togglePin} />
          </div>
        </div>

        {/* Clicking navigates to the thread; inner links stopPropagation, so a
            URL in a post opens the URL, not the thread. */}
        <div
          onClick={() => router.push(`/community/${post.id}`)}
          className="mt-2.5 flex cursor-pointer items-start gap-3"
        >
          <RichText text={post.body} className="line-clamp-2 min-w-0 flex-1 text-[14px] leading-[1.6] text-ink/85" />
          {post.shot && <Attachment shot={post.shot} variant="thumb" />}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 px-4 pb-3.5">
        <button
          type="button"
          onClick={toggleLike}
          aria-label={liked ? "Unlike" : "Like"}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
            liked
              ? "border-danger/25 bg-danger-bg text-danger"
              : "border-navy/12 text-navy/60 hover:bg-navy/[0.04]"
          }`}
        >
          <HeartIcon className="h-[17px] w-[17px]" filled={liked} />
          {likes}
        </button>
        <Link
          href={`/community/${post.id}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-navy/12 px-3 py-1.5 text-[13px] font-semibold text-navy/60 transition-colors hover:bg-navy/[0.04]"
        >
          <CommentIcon className="h-[17px] w-[17px]" />
          {post.commentCount}
        </Link>

        {post.commentCount > 0 && (
          <Link
            href={`/community/${post.id}`}
            className="ml-auto flex items-center gap-2 text-[12.5px] font-semibold text-brand-600 transition-colors hover:text-brand"
          >
            <AvatarStack items={post.recentCommenters ?? []} size={22} />
            New comment {post.lastCommentAt} ago
          </Link>
        )}
      </div>
    </article>
  );
}
