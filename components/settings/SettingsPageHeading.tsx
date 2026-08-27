export function SettingsPageHeading({
  title,
}: {
  title: string;
}) {
  return (
    <header className="mb-7">
      <h1 className="font-display text-[30px] font-extrabold tracking-[-0.035em] text-navy sm:text-[34px]">
        {title}
      </h1>
    </header>
  );
}
