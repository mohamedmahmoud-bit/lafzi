import { Flame, LogOut } from "lucide-react";
import Link from "next/link";
import { avatarEmoji, brand } from "@/config/brand";
import { Num, Xp } from "@/components/ui/num";
import { noonGoHref } from "@/features/noon-integration/urls";
import { DesktopNav } from "./main-nav";
import { NoonCta } from "./noon-cta";

export function AppHeader({
  user,
  streak,
  xp,
}: {
  user: { displayName: string; avatar: string; role: string };
  streak: number;
  xp: number;
}) {
  return (
    <header className="border-border bg-background/90 sticky top-0 z-30 border-b backdrop-blur">
      <div className="mx-auto flex h-15 max-w-6xl items-center gap-3 px-4">
        <Link
          href="/"
          className="flex items-baseline gap-2"
          aria-label={`${brand.productName} — الرئيسية`}
        >
          <span className="font-display text-primary text-2xl font-bold">{brand.productName}</span>
          <span className="text-muted hidden text-xs sm:inline">مع {brand.partnerName}</span>
        </Link>
        <DesktopNav />
        <div className="ms-auto flex items-center gap-2">
          <span
            className="bg-streak-soft text-streak flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold"
            title="السلسلة الحالية"
          >
            <Flame aria-hidden className="size-4" />
            <Num value={streak} />
            <span className="sr-only">أيام متتالية</span>
          </span>
          <span
            className="bg-xp-soft text-xp hidden rounded-full px-2.5 py-1 text-sm font-bold sm:inline"
            title="مجموع النقاط"
          >
            <Xp value={xp} />
          </span>
          <NoonCta
            href={noonGoHref("header")}
            size="sm"
            label="تدرب على نون"
            className="hidden md:inline-flex"
          />
          <NoonCta href={noonGoHref("header_mobile")} size="sm" label="نون" className="md:hidden" />
          {user.role === "admin" && (
            <Link
              href="/admin"
              className="text-muted hover:text-foreground hidden text-sm font-medium sm:inline"
            >
              الإدارة
            </Link>
          )}
          <span
            aria-hidden
            className="bg-surface-muted grid size-9 place-items-center rounded-full text-lg"
          >
            {avatarEmoji(user.avatar)}
          </span>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="text-muted hover:bg-surface-muted grid size-9 place-items-center rounded-full"
              aria-label="تسجيل الخروج"
            >
              <LogOut aria-hidden className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
