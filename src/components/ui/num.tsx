import { formatNumber } from "@/lib/utils";

/** Number isolated from surrounding bidi text so "37 / 50" and "+20 XP" render correctly in RTL. */
export function Num({ value, className }: { value: number; className?: string }) {
  return <bdi className={className ?? "tabular-nums"}>{formatNumber(value)}</bdi>;
}

/** "+57 XP" isolated as an LTR run — otherwise the bidi algorithm renders it as "XP 57+". */
export function Xp({
  value,
  plus = false,
  className,
}: {
  value: number;
  plus?: boolean;
  className?: string;
}) {
  return (
    <bdi dir="ltr" className={className ?? "tabular-nums"}>
      {plus ? "+" : ""}
      {formatNumber(value)} XP
    </bdi>
  );
}
