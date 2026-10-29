import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "rounded-brand border-border bg-surface border p-5",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={cn("text-foreground text-base font-bold", className)} {...props} />;
}

export function CardHint({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-muted text-sm", className)} {...props} />;
}
