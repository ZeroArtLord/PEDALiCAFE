interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
}

export function PageHeader({ eyebrow, title, description }: PageHeaderProps) {
  return (
    <section className="glass-card rounded-[28px] p-5 sm:p-6">
      <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">{eyebrow}</p>
      <h1 className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)] sm:text-3xl">
        {title}
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--color-ink-soft)]">
        {description}
      </p>
    </section>
  );
}
