export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <header className="mb-7 max-w-3xl">
      {eyebrow ? <p className="text-xs font-semibold text-brand-600">{eyebrow}</p> : null}
      <h1 className="mt-1 font-display text-[30px] font-semibold leading-tight tracking-[-0.035em] text-ink sm:text-[36px]">{title}</h1>
      {description ? <p className="mt-2 max-w-2xl text-[15px] leading-6 text-navy/58">{description}</p> : null}
    </header>
  );
}
