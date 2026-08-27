import type { Player } from "@/lib/gamification";

// Navy hero with diagonal light streaks and a giant ghosted "1500".
export function PlayerBanner({ player }: { player: Player }) {
  return (
    <div
      className="relative overflow-hidden"
      style={{
        background:
          "linear-gradient(110deg,transparent 36%,rgba(124,203,255,0.22) 44%,transparent 52%)," +
          "linear-gradient(125deg,transparent 56%,rgba(124,203,255,0.16) 63%,transparent 70%)," +
          "linear-gradient(130deg,#07193b 0%,#0b2a5b 42%,#1b46a8 74%,#0b2a5b 100%)",
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-10 font-display font-black leading-none tracking-[-0.04em]"
        style={{ fontSize: "clamp(120px, 42vw, 240px)", color: "rgba(255,255,255,0.04)" }}
      >
        1500
      </div>
      <div className="relative mx-auto w-full max-w-[1120px] px-5 pb-[64px] pt-[26px] sm:px-6 sm:pb-[78px] sm:pt-[30px]">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky">{player.season}</div>
        <h1 className="mt-2.5 font-display text-[26px] font-extrabold leading-[1.08] tracking-[-0.02em] text-white sm:text-[34px] sm:leading-[1.05]">
          Welcome back, {player.firstName}.
        </h1>
        <p className="mt-2 max-w-[460px] text-[15px] leading-[1.55] text-white/70">
          {player.xpBehindRival > 0 ? (
            <>
              You&apos;re <strong className="text-white">{player.xpBehindRival} XP</strong> from passing {player.rivalName} on
              the weekly board. Two clean drills does it.
            </>
          ) : (
            <>
              You&apos;re <strong className="text-white">#{player.rank}</strong> on the weekly board. Keep the streak alive and
              stay on top.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
