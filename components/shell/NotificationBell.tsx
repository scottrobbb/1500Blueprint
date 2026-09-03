"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { CommunityNotification } from "@/lib/community/types";
import { BellIcon } from "./icons";

// Non-intrusive notification bell for the shared nav: a badge when you have
// unread mentions/replies, and a small dropdown (same anatomy as AccountMenu).
// Fetches client-side so it adds nothing to any page's server render; opening it
// clears the badge. Fails quiet — if the endpoint errors the bell just stays empty.
export function NotificationBell({
  tone = "light",
  communityHrefBase = "/community",
  placement = "bottom",
  align = "right",
}: {
  tone?: "light" | "dark";
  communityHrefBase?: string;
  placement?: "top" | "bottom";
  align?: "left" | "right";
} = {}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CommunityNotification[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/community/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { items: CommunityNotification[]; unread: number };
      setItems(data.items);
      setUnread(data.unread);
    } catch {
      // ignore — bell stays as-is
    }
  }, []);

  // Load on mount, refresh on tab focus, and slow-poll so a new mention appears
  // without a reload. 60s is plenty for a study community. (load() only setStates
  // after an await, so it never triggers the synchronous cascade the rule guards.)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    const id = window.setInterval(load, 60_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(id);
    };
  }, [load]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      // Clear the badge optimistically; the list stays readable.
      setUnread(0);
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      try {
        await fetch("/api/community/notifications/read", { method: "POST" });
      } catch {
        // a failed mark-read re-syncs on the next poll
      }
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        className={`relative inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
          tone === "dark"
            ? "text-white/55 hover:bg-white/10 hover:text-white"
            : "text-navy/55 hover:bg-navy/[0.06] hover:text-navy"
        }`}
      >
        <BellIcon className="h-[19px] w-[19px]" />
        {unread > 0 && (
          <span className={`absolute right-0.5 top-0.5 inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-flag px-[3px] text-[9px] font-bold leading-none text-white ring-2 ${tone === "dark" ? "ring-[#0c2348]" : "ring-white"}`}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="menu"
            className={`absolute z-50 w-[320px] overflow-hidden rounded-xl border border-navy/12 bg-white shadow-xl ${
              placement === "top" ? "bottom-full mb-2" : "top-full mt-2"
            } ${align === "left" ? "left-0" : "right-0"}`}
          >
            <div className="border-b border-navy/10 px-4 py-2.5">
              <div className="text-sm font-bold text-navy">Notifications</div>
            </div>

            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-[13px] text-navy/50">
                Nothing yet. Mentions and replies show up here.
              </div>
            ) : (
              <ul className="max-h-[360px] overflow-y-auto">
                {items.map((n) => {
                  const row = (
                    <div
                      className={`flex gap-2.5 px-4 py-3 transition-colors hover:bg-navy/[0.03] ${
                        n.read ? "" : "bg-brand/[0.045]"
                      }`}
                    >
                      <span className="mt-0.5 inline-flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[linear-gradient(135deg,#3fa9f5,#0b2a5b)] font-display text-[11px] font-extrabold text-static-white">
                        {initialsOf(n.actorName, n.actorHandle)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] leading-snug text-ink">
                          <span className="font-bold">{n.actorName || `@${n.actorHandle}`}</span>{" "}
                          <span className="text-navy/60">
                            {n.kind === "reply" ? "replied to your comment" : "mentioned you"}
                          </span>
                        </p>
                        {n.excerpt && (
                          <p className="mt-0.5 truncate text-[12.5px] text-navy/50">{n.excerpt}</p>
                        )}
                        <p className="mt-0.5 text-[11px] font-medium text-navy/40">{n.timeAgo}</p>
                      </div>
                      {!n.read && (
                        <span className="mt-1.5 inline-block h-2 w-2 flex-none rounded-full bg-brand" />
                      )}
                    </div>
                  );
                  return (
                    <li key={n.id}>
                      {n.postId ? (
                        <Link href={`${communityHrefBase}/${n.postId}`} onClick={() => setOpen(false)} className="block">
                          {row}
                        </Link>
                      ) : (
                        row
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Actor initials for the avatar, from the snapshot name (falls back to handle).
function initialsOf(name: string, handle: string): string {
  const src = (name || handle).trim();
  if (!src) return "?";
  const parts = src.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}
