import { Flame, LogOut } from "lucide-react";
import Link from "next/link";
import { brand } from "@/config/brand";
import { Num, Xp } from "@/components/ui/num";
import { practiceHref } from "@/features/noon-practice/href";
import { Avatar, NoonLogo } from "./brand-art";
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
    <header className="border-border bg-background sticky top-0 z-30 border-b">
      <div className="mx-auto flex h-15 max-w-6xl items-center gap-3 px-4">
        <Link
          href="/"
          className="flex items-center gap-2.5"
          aria-label={`${brand.productName} من نون — الرئيسية`}
        >
          <span className="font-display text-primary-ink text-[1.7rem] leading-none font-bold">{brand.productName}</span>
          <span aria-hidden className="bg-border hidden h-5 w-px sm:block" />
          <NoonLogo width={64} className="hidden sm:block" />
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
            href={practiceHref("header")}
            size="sm"
            label="تدرب على نون"
            className="hidden md:inline-flex"
          />
          {user.role === "admin" && (
            <Link
              href="/admin"
              className="text-muted hover:text-foreground hidden text-sm font-medium sm:inline"
            >
              الإدارة
            </Link>
          )}
          <Link href="/profile" aria-label="ملفي" className="rounded-full">
            <Avatar avatar={user.avatar} size={36} />
          </Link>
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
