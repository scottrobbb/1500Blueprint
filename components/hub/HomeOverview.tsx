export function HomeOverview({
  firstName,
}: {
  firstName: string | null;
}) {
  return (
    <section aria-labelledby="home-heading" className="mx-auto w-full max-w-[1080px] px-4 pt-9 sm:px-6 sm:pt-12">
      <h1
        id="home-heading"
        className="font-display text-[28px] font-bold leading-tight text-navy sm:text-[32px]"
      >
        Welcome back{firstName ? `, ${firstName}` : ""}.
      </h1>
    </section>
  );
}
