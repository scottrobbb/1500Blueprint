import type { Player } from "@/lib/gamification";

export function PlayerBanner({ player }: { player: Player }) {
  return (
    <header className="border-b border-navy/10 bg-[#f7f8fa]">
      <div className="mx-auto w-full max-w-[1120px] px-4 pb-6 pt-8 sm:px-6 sm:pb-7 sm:pt-10">
        <div className="text-xs font-semibold text-brand-600">Practice</div>
        <h1 className="mt-1 font-display text-[32px] font-semibold leading-tight tracking-[-0.035em] text-ink sm:text-[38px]">
          Drills
        </h1>
        <p className="mt-2 max-w-[620px] text-[15px] leading-6 text-navy/58">
          {player.xpBehindRival > 0 ? (
            <>
              You are {player.xpBehindRival} XP behind {player.rivalName} on this week&apos;s leaderboard.
            </>
          ) : (
            <>
              You are #{player.rank} on this week&apos;s leaderboard.
            </>
          )}
        </p>
      </div>
    </header>
  );
}
