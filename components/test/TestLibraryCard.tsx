import Link from "next/link";
import { ChevronRightIcon } from "@/components/shell/icons";
import { LockIcon, LockedBadge } from "@/components/account/UpgradePrompt";

type RequiredPlan = "core" | "max";

type TestLibraryCardProps = {
  slug: string;
  title: string;
  index: number;
  attempts: number;
  bestScore: number | null;
  resumable: boolean;
  locked: boolean;
  planLocked: boolean;
  requiredPlan: RequiredPlan;
  draft: boolean;
};

export function TestLibraryCard({
  slug,
  title,
  index,
  attempts,
  bestScore,
  resumable,
  locked,
  planLocked,
  requiredPlan,
  draft,
}: TestLibraryCardProps) {
  const actionLabel = resumable ? "Resume test" : attempts > 0 ? "Retake test" : "Start test";

  return (
    <article className={`group flex h-full flex-col overflow-hidden rounded-[18px] border bg-white shadow-pop transition-[transform,border-color,box-shadow] duration-200 motion-reduce:transform-none motion-reduce:transition-none ${locked ? "border-gold/25" : "border-navy/10 hover:-translate-y-0.5 hover:border-brand/35 hover:shadow-[0_14px_36px_-24px_rgba(11,42,91,0.55)]"}`}>
      <TestPreview variant={index % 4} locked={locked} />
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-brand-600">Full adaptive SAT</p>
            <h3 className="mt-1.5 font-display text-[22px] font-extrabold leading-tight tracking-[-0.03em] text-ink">{title}</h3>
          </div>
          <div className="flex flex-none flex-wrap justify-end gap-2">
            {bestScore != null ? <ScoreBadge score={bestScore} /> : null}
            {draft ? <span className="rounded-full border border-gold/25 bg-[#fffaf0] px-2.5 py-1 text-[10px] font-extrabold text-[#70550b]">Draft</span> : null}
            {planLocked ? <LockedBadge plan={requiredPlan} /> : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-navy/50">
          <TestMeta icon={<ClockIcon />} label="2 hr 14 min" />
          <TestMeta icon={<ModuleIcon />} label="4 timed modules" />
          <TestMeta icon={<AttemptIcon />} label={`${attempts} ${attempts === 1 ? "attempt" : "attempts"}`} />
        </div>

        <div className="mt-auto pt-5">
          {locked ? (
            planLocked ? (
              <Link href="/pricing" className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-brand/20 bg-ice/70 px-4 text-sm font-extrabold text-navy transition-colors hover:border-brand/40 hover:bg-ice focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                <LockIcon className="h-4 w-4 text-[#7a5900]" /> Unlock with {requiredPlan === "core" ? "Core" : "Max"}
              </Link>
            ) : (
              <div className="flex min-h-11 items-center justify-center rounded-xl bg-navy/[0.05] px-4 text-sm font-bold text-navy/40">Coming soon</div>
            )
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <Link href={`/practice-test/${slug}?workspace=ultimate`} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-navy px-5 text-sm font-bold text-white transition-colors hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                {actionLabel} <ChevronRightIcon className="h-4 w-4" />
              </Link>
              <Link href={`/practice-test/${slug}/modules?workspace=ultimate`} className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-navy/15 bg-white px-4 text-sm font-bold text-navy transition-colors hover:bg-haze focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                Modules
              </Link>
            </div>
          )}
          {attempts > 0 && !locked ? (
            <Link href="/ultimate/tests/completed" className="mt-3 inline-flex min-h-8 cursor-pointer items-center gap-1 text-xs font-semibold text-brand-600 transition-colors hover:text-navy">
              View score history <ChevronRightIcon className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function TestPreview({ variant, locked }: { variant: number; locked: boolean }) {
  return (
    <div aria-hidden="true" className={`relative h-[205px] overflow-hidden border-b border-white/10 bg-[linear-gradient(125deg,#0b2a5b,#174b91_65%,#3fa9f5)] p-5 sm:h-[225px] sm:p-6 ${locked ? "grayscale" : ""}`}>
      <div className={`mx-auto h-full max-w-[500px] overflow-hidden rounded-xl border bg-white shadow-[0_18px_40px_-24px_rgba(6,22,45,0.85)] ${locked ? "border-white/10 opacity-75" : "border-white/25"}`}>
        <div className="flex h-9 items-center justify-between border-b border-navy/10 px-3">
          <span className="h-1.5 w-12 rounded-full bg-navy/10" />
          <span className="inline-flex items-center gap-1.5 text-[8px] font-semibold tabular-nums text-navy/30"><ClockIcon /> 32:00</span>
          <span className="h-2 w-2 rounded-full border border-navy/15" />
        </div>
        {variant === 0 ? <SplitExam passage="wide" /> : null}
        {variant === 1 ? <SplitExam passage="narrow" /> : null}
        {variant === 2 ? <MathExam /> : null}
        {variant === 3 ? <ReadingExam /> : null}
      </div>
      <span className="absolute bottom-2.5 right-4 rounded-full border border-white/20 bg-white/90 px-2 py-1 text-[8px] font-extrabold uppercase tracking-[0.1em] text-brand-600 shadow-sm">Digital SAT</span>
    </div>
  );
}

function SplitExam({ passage }: { passage: "wide" | "narrow" }) {
  const passageClass = passage === "wide" ? "grid-cols-[1.25fr_0.75fr]" : "grid-cols-[0.72fr_1.28fr]";
  return (
    <div className={`grid h-[calc(100%_-_2.25rem)] ${passageClass}`}>
      <div className="space-y-2 border-r border-navy/10 p-4">
        <SkeletonLine width="w-3/4" strong />
        <SkeletonLine width="w-full" />
        <SkeletonLine width="w-[92%]" />
        <SkeletonLine width="w-[84%]" />
        <SkeletonLine width="w-[68%]" />
      </div>
      <div className="p-3">
        <div className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded bg-ink text-[8px] font-bold text-white">1</span><SkeletonLine width="w-16" /></div>
        <div className="mt-3 space-y-2">
          {["w-full", "w-[88%]", "w-[94%]", "w-[76%]"].map((width, choiceIndex) => <ChoiceSkeleton key={width} width={width} selected={choiceIndex === variantChoice(passage)} />)}
        </div>
      </div>
    </div>
  );
}

function MathExam() {
  return (
    <div className="h-[calc(100%_-_2.25rem)] px-5 py-4">
      <div className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded bg-ink text-[8px] font-bold text-white">12</span><SkeletonLine width="w-20" /></div>
      <div className="mx-auto mt-4 h-8 w-28 rounded border border-navy/10 bg-haze/80" />
      <div className="mx-auto mt-4 grid max-w-[310px] grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((choiceIndex) => <ChoiceSkeleton key={choiceIndex} width={choiceIndex % 2 ? "w-12" : "w-16"} selected={choiceIndex === 2} />)}
      </div>
    </div>
  );
}

function ReadingExam() {
  return (
    <div className="h-[calc(100%_-_2.25rem)] p-4">
      <div className="mx-auto max-w-[360px]">
        <SkeletonLine width="w-full" strong />
        <div className="mt-2 space-y-1.5"><SkeletonLine width="w-[96%]" /><SkeletonLine width="w-[90%]" /><SkeletonLine width="w-[72%]" /></div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((choiceIndex) => <ChoiceSkeleton key={choiceIndex} width="w-16" selected={choiceIndex === 1} />)}
        </div>
      </div>
    </div>
  );
}

function variantChoice(passage: "wide" | "narrow"): number {
  return passage === "wide" ? 1 : 3;
}

function ChoiceSkeleton({ width, selected }: { width: string; selected?: boolean }) {
  return (
    <div className={`flex h-7 items-center gap-2 rounded-md border px-2 ${selected ? "border-brand/30 bg-ice" : "border-navy/8 bg-haze/50"}`}>
      <span className={`h-3 w-3 flex-none rounded-full border ${selected ? "border-brand bg-brand" : "border-navy/15 bg-white"}`} />
      <span className={`h-1.5 rounded-full bg-navy/10 ${width}`} />
    </div>
  );
}

function SkeletonLine({ width, strong = false }: { width: string; strong?: boolean }) {
  return <span className={`block rounded-full ${width} ${strong ? "h-2 bg-navy/14" : "h-1.5 bg-navy/10"}`} />;
}

function ScoreBadge({ score }: { score: number }) {
  return (
    <span className="rounded-full border border-success/20 bg-success-bg px-2.5 py-1 text-right text-[10px] font-extrabold text-success-600">
      Best <span className="tabular-nums">{score}</span>
    </span>
  );
}

function TestMeta({ icon, label }: { icon: React.ReactNode; label: string }) {
  return <span className="inline-flex items-center gap-1.5">{icon}<span>{label}</span></span>;
}

function ClockIcon() {
  return <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10" cy="10" r="7" /><path d="M10 6v4l2.5 1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ModuleIcon() {
  return <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="3" width="5.5" height="5.5" rx="1" /><rect x="11.5" y="3" width="5.5" height="5.5" rx="1" /><rect x="3" y="11.5" width="5.5" height="5.5" rx="1" /><rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1" /></svg>;
}

function AttemptIcon() {
  return <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 5.5h8.5A3.5 3.5 0 0 1 16 9v0a3.5 3.5 0 0 1-3.5 3.5H5" strokeLinecap="round" /><path d="m7 2.5-3 3 3 3M5 12.5l-2 2 2 2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
