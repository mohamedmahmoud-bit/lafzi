import Link from "next/link";
import { brand } from "@/config/brand";
import { requireAdmin } from "@/features/auth/dal";

const LINKS = [
  { href: "/admin", label: "المؤشرات" },
  { href: "/admin/words", label: "الكلمات" },
  { href: "/admin/import", label: "استيراد CSV" },
  { href: "/admin/word-of-day", label: "كلمة اليوم" },
  { href: "/admin/badges", label: "الإنجازات" },
  { href: "/admin/xp-rules", label: "النقاط والمستويات" },
  { href: "/admin/audit", label: "سجل التدقيق" },
];

export const metadata = {
  title: { default: "الإدارة", template: `%s · إدارة ${brand.productName}` },
};

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdmin();
  return (
    <div className="min-h-dvh">
      <header className="border-border bg-surface border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/admin" className="font-display text-primary text-xl font-bold">
            {brand.productName} · الإدارة
          </Link>
          <nav aria-label="تنقل الإدارة" className="flex flex-wrap gap-1 text-sm">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-muted hover:bg-surface-muted hover:text-foreground rounded-full px-3 py-1"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <span className="text-muted ms-auto text-sm">{admin.displayName}</span>
          <Link href="/" className="text-primary text-sm">
            واجهة الطالب
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
