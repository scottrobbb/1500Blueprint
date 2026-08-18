import type { TopMember } from "@/lib/community/types";
import { Avatar } from "./Avatar";

// Desktop-only side rail modeled on Whop's right column: a compact "about" blurb
// + a "Top members" list driven by real post counts (community_top_members RPC).
const ABOUT = [
  "Score drops, wins, and questions from the crew.",
  "Be helpful, hype each other, keep it about the SAT.",
];

export function RightRail({ topMembers, variant = "default" }: { topMembers: TopMember[]; variant?: "default" | "ultimate" }) {
  return (
    <aside className="hidden w-full flex-col gap-3 lg:flex">
      <div className={`${variant === "ultimate" ? "rounded-2xl shadow-pop" : "rounded-xl"} border border-navy/10 bg-white p-4`}>
        <h3 className="font-display text-[14px] font-bold text-navy">1500 Community</h3>
        <div className="mt-2 flex flex-col gap-1.5">
          {ABOUT.map((line) => (
            <p key={line} className="text-[12.5px] leading-[1.5] text-navy/55">
              {line}
            </p>
          ))}
        </div>
      </div>

      <div className={`${variant === "ultimate" ? "rounded-2xl shadow-pop" : "rounded-xl"} border border-navy/10 bg-white`}>
        <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
          <h3 className="font-display text-[14px] font-bold text-navy">Top members</h3>
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-navy/40">This week</span>
        </div>
        {topMembers.length === 0 ? (
          <p className="px-4 pb-4 text-[12.5px] text-navy/45">No posts yet this week. Be the first.</p>
        ) : (
          <div className="pb-1.5">
            {topMembers.map((m, i) => (
              <div key={`${m.initials}-${i}`} className="flex items-center gap-2.5 px-4 py-2">
                <span
                  className="w-3.5 text-center font-display text-[13px] font-extrabold"
                  style={{ color: i < 3 ? "#f0a900" : "rgba(11,42,91,0.45)" }}
                >
                  {i + 1}
                </span>
                <Avatar src={m.avatarUrl} initials={m.initials} alt={m.name} size={32} />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-[13px] font-bold text-ink">{m.name}</div>
                  <div className="truncate text-[11.5px] text-navy/45">
                    Level {m.level} · {m.postCount} {m.postCount === 1 ? "post" : "posts"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
