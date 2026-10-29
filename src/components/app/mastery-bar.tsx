import { Num } from "@/components/ui/num";
import { MASTERY_LABELS, type MasteryState } from "@/features/vocabulary/srs";
import { cn } from "@/lib/utils";

const COLORS: Record<MasteryState, string> = {
  // Brand chart palette order: terracotta, espresso, clay; oak for the unfilled share.
  mastered: "bg-primary",
  familiar: "bg-foreground",
  learning: "bg-clay",
  new: "bg-oak",
};
const ORDER: MasteryState[] = ["mastered", "familiar", "learning", "new"];

export function MasteryBar({
  counts,
  total,
  className,
}: {
  counts: Record<MasteryState, number>;
  total: number;
  className?: string;
}) {
  return (
    <div className={className}>
      <div
        className="bg-oak flex h-3 w-full gap-[2px] overflow-hidden rounded-full"
        aria-hidden
      >
        {ORDER.map((s) => (
          <div
            key={s}
            className={COLORS[s]}
            style={{ width: `${total ? (counts[s] / total) * 100 : 0}%` }}
          />
        ))}
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {ORDER.map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn(
                "size-2.5 rounded-full",
                COLORS[s],
                s === "new" && "border-border border",
              )}
            />
            <span className="text-muted">{MASTERY_LABELS[s]}</span>
            <strong className="ms-auto">
              <Num value={counts[s]} />
            </strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
