import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("rounded-brand bg-surface-muted animate-pulse", className)} />
  );
}
