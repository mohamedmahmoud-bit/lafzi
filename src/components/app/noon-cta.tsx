import { ArrowUpLeft } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The persistent "تدرب على نون" action. Always goes through /go/noon so the click is tracked and
 * the real deep link is built server-side.
 */
export function NoonCta({
  href,
  label = "تدرب على نون",
  size = "md",
  className,
}: {
  href: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className={cn(
        "bg-noon text-noon-foreground inline-flex items-center justify-center gap-2 rounded-[calc(var(--brand-radius)*0.8)] font-bold transition hover:brightness-125 active:scale-[0.98]",
        size === "sm" && "h-9 px-3 text-sm",
        size === "md" && "h-11 px-5",
        size === "lg" && "h-13 w-full px-6 text-base",
        className,
      )}
    >
      {label}
      <ArrowUpLeft aria-hidden className="size-4" />
    </Link>
  );
}
