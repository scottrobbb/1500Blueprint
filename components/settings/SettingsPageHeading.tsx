export function SettingsPageHeading({
  title,
}: {
  title: string;
}) {
  return (
    <header className="mb-8">
      <h1 className="font-display text-2xl font-extrabold tracking-[-0.025em] text-navy sm:text-[26px]">
        {title}
      </h1>
    </header>
  );
}
