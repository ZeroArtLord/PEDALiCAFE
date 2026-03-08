interface MetricCardProps {
  label: string;
  value: string;
  helper: string;
}

export function MetricCard({ label, value, helper }: MetricCardProps) {
  return (
    <article className="glass-card metric-card rounded-[28px] p-5">
      <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">{label}</p>
      <p className="mt-4 font-display text-3xl font-semibold text-[var(--color-ink)]">{value}</p>
      <p className="mt-2 max-w-[18rem] text-sm leading-6 text-[var(--color-ink-soft)]">{helper}</p>
    </article>
  );
}
