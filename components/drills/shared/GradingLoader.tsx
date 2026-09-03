// The "AI is grading..." interstitial shown between submitting an explanation
// and the feedback screen. Spinner + shimmer skeleton so the layout feels alive.
export function GradingLoader({
  title = "Grading your reasoning…",
  subtitle = "Checking each step of the critical path.",
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="mx-auto max-w-[560px] pt-2">
      <div className="animate-pop-in rounded-xl border border-navy/15 bg-white p-[30px] text-center">
        <div className="mx-auto h-[46px] w-[46px] animate-spin-slow rounded-full border-[3px] border-brand/25 border-t-brand" />
        <h3 className="mb-1 mt-[18px] font-display text-lg font-bold text-navy">{title}</h3>
        {subtitle ? <p className="text-[13.5px] text-navy/55">{subtitle}</p> : null}
        <div className="mt-[22px] flex flex-col gap-2.5">
          <div className="shimmer h-3 w-[90%] rounded" />
          <div className="shimmer h-3 w-full rounded" />
          <div className="shimmer h-3 w-[70%] rounded" />
        </div>
      </div>
    </div>
  );
}
