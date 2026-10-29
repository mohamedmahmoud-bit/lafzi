import { and, eq, sql } from "drizzle-orm";
import { BookOpenText, Brain, Repeat, Swords } from "lucide-react";
import Link from "next/link";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHint } from "@/components/ui/card";
import { Num, Xp } from "@/components/ui/num";
import { getDb } from "@/db/client";
import { practiceSessions, studentWordProgress } from "@/db/schema";
import { requireUser } from "@/features/auth/dal";
import { startSessionAction } from "@/features/vocabulary/actions";
import { DECK_LIMITS } from "@/features/vocabulary/deck";
import { learningDay } from "@/lib/time";

export const metadata = { title: "تدريب الكلمات" };

export default async function PracticePage() {
  const user = await requireUser();
  const db = getDb();
  const today = learningDay();
  const [[stats], [due]] = await Promise.all([
    db
      .select({
        dailyDone: sql<number>`count(*) filter (where ${practiceSessions.kind} = 'daily' and ${practiceSessions.status} = 'completed')::int`,
        open: sql<
          string | null
        >`max(${practiceSessions.id}::text) filter (where ${practiceSessions.status} = 'in_progress')`,
      })
      .from(practiceSessions)
      .where(and(eq(practiceSessions.userId, user.id), eq(practiceSessions.day, today))),
    db
      .select({
        n: sql<number>`count(*) filter (where ${studentWordProgress.nextReviewAt} <= now())::int`,
      })
      .from(studentWordProgress)
      .where(eq(studentWordProgress.userId, user.id)),
  ]);
  const dailyDone = stats.dailyDone > 0;
  const limits = DECK_LIMITS.daily;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <p className="text-secondary text-sm font-semibold">تدريب الكلمات</p>
        <h1 className="text-2xl font-bold">{dailyDone ? "أنهيت تدريب اليوم" : "تدريب اليوم"}</h1>
        <p className="text-muted">
          {dailyDone
            ? "تقدر تراجع كلماتك الأضعف الآن، أو تكمل يومك بالتدرب على نون."
            : "جلسة قصيرة مصمّمة لك: نبدأ بكلمات جديدة تستنتجها، ثم نراجع ما يوشك أن يُنسى."}
        </p>
      </header>

      {!dailyDone && (
        <Card>
          <ul className="grid gap-3 sm:grid-cols-3">
            <DeckItem
              icon={<Brain className="size-5" />}
              title={
                <>
                  <Num value={limits.newWords} /> كلمات جديدة
                </>
              }
              hint="استنتجها من السياق"
            />
            <DeckItem
              icon={<Repeat className="size-5" />}
              title={
                <>
                  <Num value={limits.reviews} /> مراجعات سريعة
                </>
              }
              hint={
                due.n > 0 ? (
                  <>
                    لديك <Num value={due.n} /> كلمة مستحقة
                  </>
                ) : (
                  "حسب ذاكرتك"
                )
              }
            />
            <DeckItem
              icon={<Swords className="size-5" />}
              title="تحدٍّ لفظي"
              hint="سؤال تناظر بأسلوب القدرات"
            />
          </ul>
          <CardHint className="mt-4">
            3–5 دقائق · <Xp value={20} plus /> عند الإنهاء · تُحتسب في سلسلتك
          </CardHint>
        </Card>
      )}

      {stats.open ? (
        <ButtonLink href={`/practice/${stats.open}`} size="lg" block>
          أكمل جلستك
        </ButtonLink>
      ) : (
        <form action={startSessionAction}>
          <Button type="submit" size="lg" block variant={dailyDone ? "secondary" : "primary"}>
            <BookOpenText aria-hidden className="size-5" />
            {dailyDone ? (
              <>
                جلسة مراجعة إضافية (<Xp value={1} plus /> لكل إجابة صحيحة)
              </>
            ) : (
              "ابدأ تدريب اليوم"
            )}
          </Button>
        </form>
      )}
      <p className="text-center text-sm">
        <Link href="/words" className="text-primary-ink font-medium">
          تصفّح بنك الكلمات
        </Link>
      </p>
    </div>
  );
}

function DeckItem({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  hint: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 sm:flex-col sm:items-start">
      <span
        aria-hidden
        className="bg-primary-soft text-primary-ink grid size-10 place-items-center rounded-xl"
      >
        {icon}
      </span>
      <div>
        <p className="font-bold">{title}</p>
        <p className="text-muted text-sm">{hint}</p>
      </div>
    </li>
  );
}
