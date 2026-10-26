import { cn } from "@/lib/utils";

/** Accessible progress bar. In RTL it fills from the right, as Arabic readers expect. */
export function Progress({
  value,
  max = 1,
  label,
  className,
  barClassName,
}: {
  value: number;
  max?: number;
  label: string;
  className?: string;
  barClassName?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn("bg-surface-muted h-2.5 w-full overflow-hidden rounded-full", className)}
    >
      <div
        className={cn(
          "bg-primary h-full rounded-full transition-[width] duration-500",
          barClassName,
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
