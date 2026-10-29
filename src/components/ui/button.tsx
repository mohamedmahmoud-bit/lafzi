import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-[transform,background-color,box-shadow] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 rounded-[calc(var(--brand-radius)*0.8)]",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:brightness-110",
        secondary: "bg-primary-soft text-primary-ink hover:brightness-95",
        outline: "border border-border bg-surface text-foreground hover:bg-surface-muted",
        ghost: "text-foreground hover:bg-surface-muted",
        noon: "bg-noon text-noon-foreground hover:brightness-125",
        success: "bg-success text-white hover:brightness-110",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-5 text-[0.95rem]",
        lg: "h-13 px-6 text-base",
        icon: "size-10",
      },
      block: { true: "w-full" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type Variants = VariantProps<typeof buttonVariants>;

export function Button({
  className,
  variant,
  size,
  block,
  ...props
}: ComponentProps<"button"> & Variants) {
  return <button className={cn(buttonVariants({ variant, size, block }), className)} {...props} />;
}

export function ButtonLink({
  className,
  variant,
  size,
  block,
  ...props
}: ComponentProps<typeof Link> & Variants) {
  return <Link className={cn(buttonVariants({ variant, size, block }), className)} {...props} />;
}
