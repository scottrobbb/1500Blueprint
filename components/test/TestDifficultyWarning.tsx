// Red notice on the test library pages: our tests run harder than the real SAT.
// Fixed red with static white so it stays red and readable in dark mode, where
// the danger tokens and text-white swap.
export function TestDifficultyWarning({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-start gap-3 bg-red-700 px-4 py-3.5 text-static-white sm:px-5 ${className}`}>
      <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 flex-none" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M12 3 2 20h20L12 3z" strokeLinejoin="round" />
        <path d="M12 10v4.5M12 17.2v.1" strokeLinecap="round" />
      </svg>
      <p className="text-[14px] leading-[1.55]">
        <strong className="font-extrabold">Warning:</strong> My practice tests are substantially harder than the real SAT
        and the Bluebook practice tests. If you get a low score, don&apos;t be discouraged. They&apos;re built to
        overprepare you for the real SAT.
      </p>
    </div>
  );
}
