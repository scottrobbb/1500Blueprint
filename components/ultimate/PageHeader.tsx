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
    <header className="mb-6">
      {eyebrow && <p className="text-[11px] font-bold uppercase tracking-[0.17em] text-brand-600">{eyebrow}</p>}
      <h1 className="mt-1 font-display text-[28px] font-extrabold tracking-[-0.03em] text-ink sm:text-[34px]">{title}</h1>
      {description && <p className="mt-1.5 max-w-2xl text-sm leading-6 text-navy/55">{description}</p>}
    </header>
  );
}
