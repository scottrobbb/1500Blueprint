export function HomeOverview({
  firstName,
  streak,
  dailyGoal,
}: {
  firstName: string | null;
  streak: number;
  dailyGoal: { done: number; total: number };
}) {
  return (
    <section aria-labelledby="home-heading" className="mx-auto w-full max-w-[1000px] px-4 pt-9 sm:px-6 sm:pt-12">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <h1
          id="home-heading"
          className="font-display text-[28px] font-bold leading-tight text-navy sm:text-[32px]"
        >
          Welcome back{firstName ? `, ${firstName}` : ""}.
        </h1>
        <dl className="flex gap-8">
          <div>
            <dt className="text-sm text-navy/50">Today</dt>
            <dd className="mt-1 font-semibold tabular-nums text-navy">
              {dailyGoal.done} of {dailyGoal.total} drills
            </dd>
          </div>
          <div>
            <dt className="text-sm text-navy/50">Streak</dt>
            <dd className="mt-1 font-semibold tabular-nums text-navy">
              {streak} {streak === 1 ? "day" : "days"}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
