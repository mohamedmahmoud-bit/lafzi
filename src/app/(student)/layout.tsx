import { eq } from "drizzle-orm";
import { AppHeader } from "@/components/app/app-header";
import { BottomNav } from "@/components/app/main-nav";
import { getDb } from "@/db/client";
import { studentProfiles } from "@/db/schema";
import { requireUser } from "@/features/auth/dal";
import { displayStreak } from "@/features/streaks/streak";
import { learningDay } from "@/lib/time";

export default async function StudentLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const [p] = await getDb()
    .select({
      xpTotal: studentProfiles.xpTotal,
      currentStreak: studentProfiles.currentStreak,
      lastQualifiedDate: studentProfiles.lastQualifiedDate,
    })
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, user.id));
  const streak = displayStreak(p, learningDay());

  return (
    <>
      <a
        href="#main"
        className="focus:bg-surface sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded focus:p-2"
      >
        تخطَّ إلى المحتوى
      </a>
      <AppHeader user={user} streak={streak.count} xp={p.xpTotal} />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-28 lg:pb-12">
        {children}
      </main>
      <BottomNav />
    </>
  );
}
