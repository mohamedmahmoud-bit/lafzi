"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isActive, NAV_ITEMS } from "./nav-items";

export function DesktopNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="التنقل الرئيسي" className="hidden items-center gap-1 lg:flex">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "text-muted hover:text-foreground rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              active && "bg-primary-soft text-primary",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="التنقل الرئيسي"
      className="border-border bg-surface/95 fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {NAV_ITEMS.filter((i) => i.mobile).map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "text-muted flex flex-col items-center gap-0.5 py-2 text-[0.7rem] font-medium",
                  active && "text-primary",
                )}
              >
                <Icon aria-hidden className="size-5" strokeWidth={active ? 2.4 : 1.8} />
                {"short" in item ? item.short : item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
