import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const pill = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
  {
    variants: {
      tone: {
        neutral: "bg-surface-muted text-muted",
        primary: "bg-primary-soft text-primary-ink",
        xp: "bg-xp-soft text-xp",
        streak: "bg-streak-soft text-streak",
        success: "bg-success-soft text-success",
        danger: "bg-danger-soft text-danger",
        dev: "border border-dashed border-xp bg-xp-soft text-xp",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Pill({
  className,
  tone,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof pill>) {
  return <span className={cn(pill({ tone }), className)} {...props} />;
}
