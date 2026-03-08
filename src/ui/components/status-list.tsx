interface StatusListProps {
  items: Array<{
    label: string;
    value: string;
    tone?: "default" | "warn" | "danger";
  }>;
}

const toneStyles = {
  default: "bg-[var(--color-brand-soft)] text-[var(--color-brand-deep)]",
  warn: "bg-orange-100 text-orange-700",
  danger: "bg-red-100 text-red-700"
};

export function StatusList({ items }: StatusListProps) {
  return (
    <div className="glass-card rounded-[28px] p-5">
      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--color-line)] bg-white/70 px-4 py-3"
          >
            <span className="text-sm text-[var(--color-ink-soft)]">{item.label}</span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                toneStyles[item.tone ?? "default"]
              }`}
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
