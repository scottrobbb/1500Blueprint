"use client";

import { useState } from "react";
import Link from "next/link";
import type { CommunityPost } from "@/lib/community/types";
import { CATEGORY } from "@/lib/community/types";

// Admin moderation table for community posts: view + delete. Deleting cascades
// to the post's comments and likes (FK on delete cascade in community.sql).
export function CommunityModeration({ initialPosts, communityBase = "/community" }: { initialPosts: CommunityPost[]; communityBase?: string }) {
  const [posts, setPosts] = useState(initialPosts);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function remove(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/community/posts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setPosts((prev) => prev.filter((p) => p.id !== id));
    } catch {
      // leave the row in place on failure
    } finally {
      setBusyId(null);
      setPendingId(null);
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-navy">Community</h1>
          <p className="mt-1 text-sm text-navy/55">
            Moderate the student feed. Deleting a post also removes its comments and likes.
          </p>
        </div>
        <span className="text-sm font-semibold text-navy/50">{posts.length} posts</span>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-card border border-dashed border-navy/15 bg-white px-6 py-16 text-center">
          <p className="font-display text-lg font-bold text-navy">No posts yet</p>
          <p className="mt-1 text-sm text-navy/55">Posts students share will show up here.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-navy/12 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-navy/10 text-[11px] font-bold uppercase tracking-[0.1em] text-navy/45">
                <th className="px-4 py-3 font-bold">Author</th>
                <th className="px-4 py-3 font-bold">Category</th>
                <th className="px-4 py-3 font-bold">Post</th>
                <th className="px-4 py-3 text-center font-bold">Likes</th>
                <th className="px-4 py-3 text-center font-bold">Comments</th>
                <th className="px-4 py-3 font-bold">When</th>
                <th className="px-4 py-3 text-right font-bold">Action</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id} className="border-b border-navy/[0.07] align-top last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-navy">{p.author.name}</div>
                    <div className="text-xs text-navy/45">@{p.author.handle}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy/60">
                      <span className={`h-1.5 w-1.5 rounded-full ${CATEGORY[p.category].dot}`} />
                      {CATEGORY[p.category].label}
                    </span>
                  </td>
                  <td className="max-w-[340px] px-4 py-3">
                    <Link href={`${communityBase}/${p.id}`} className="line-clamp-2 text-navy/80 hover:text-brand-600">
                      {p.body || (p.shot ? "(screenshot)" : "(empty)")}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-navy/70">{p.likes}</td>
                  <td className="px-4 py-3 text-center font-semibold text-navy/70">{p.commentCount}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-navy/50">{p.timeAgo}</td>
                  <td className="px-4 py-3 text-right">
                    {pendingId === p.id ? (
                      <span className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => remove(p.id)}
                          disabled={busyId === p.id}
                          className="rounded-chip bg-danger px-2.5 py-1 text-xs font-bold text-white transition-colors hover:bg-danger-600 disabled:opacity-50"
                        >
                          {busyId === p.id ? "Deleting…" : "Confirm"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingId(null)}
                          className="rounded-chip px-2.5 py-1 text-xs font-semibold text-navy/55 hover:text-navy"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPendingId(p.id)}
                        className="rounded-chip border border-danger/30 px-2.5 py-1 text-xs font-bold text-danger transition-colors hover:bg-danger-bg"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
