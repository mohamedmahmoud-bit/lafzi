import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Num } from "@/components/ui/num";
import { Pill } from "@/components/ui/pill";
import { getDb } from "@/db/client";
import { studentWordProgress, vocabularyWords } from "@/db/schema";
import { requireUser } from "@/features/auth/dal";
import { MASTERY_LABELS, type MasteryState } from "@/features/vocabulary/srs";
import { cn } from "@/lib/utils";

export const metadata = { title: "بنك الكلمات" };
const STATES: MasteryState[] = ["learning", "familiar", "mastered"];
const TONE = { learning: "xp", familiar: "primary", mastered: "success", new: "neutral" } as const;

export default async function WordsPage({ searchParams }: PageProps<"/words">) {
  const user = await requireUser();
  const { state } = await searchParams;
  const filter = STATES.includes(state as MasteryState) ? (state as MasteryState) : null;
  const rows = await getDb()
    .select({
      id: vocabularyWords.id,
      word: vocabularyWords.word,
      meaning: vocabularyWords.meaning,
      state: studentWordProgress.state,
      nextReviewAt: studentWordProgress.nextReviewAt,
    })
    .from(studentWordProgress)
    .innerJoin(vocabularyWords, eq(vocabularyWords.id, studentWordProgress.wordId))
    .where(
      and(
        eq(studentWordProgress.userId, user.id),
        filter ? eq(studentWordProgress.state, filter) : undefined,
      ),
    )
    .orderBy(asc(studentWordProgress.nextReviewAt));
  const now = new Date();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <p className="text-primary text-sm font-semibold">بنك الكلمات</p>
        <h1 className="text-2xl font-bold">
          كلماتك (<Num value={rows.length} />)
        </h1>
      </header>
      <nav aria-label="تصفية حسب الإتقان" className="flex flex-wrap gap-2">
        {[null, ...STATES].map((s) => (
          <Link
            key={s ?? "all"}
            href={s ? `/words?state=${s}` : "/words"}
            aria-current={filter === s ? "page" : undefined}
            className={cn(
              "border-border rounded-full border px-3 py-1 text-sm",
              filter === s && "border-primary bg-primary-soft text-primary",
            )}
          >
            {s ? MASTERY_LABELS[s] : "الكل"}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <Card className="text-center">
          <p className="font-semibold">لا توجد كلمات هنا بعد</p>
          <p className="text-muted text-sm">ابدأ تدريب اليوم لتضيف كلمات جديدة إلى بنكك.</p>
          <Link href="/practice" className="text-primary mt-3 inline-block font-semibold">
            ابدأ التدريب
          </Link>
        </Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-border divide-y">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-display text-xl font-bold">{r.word}</p>
                  <p className="text-muted truncate text-sm">{r.meaning}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Pill tone={TONE[r.state]}>{MASTERY_LABELS[r.state]}</Pill>
                  {r.nextReviewAt && r.nextReviewAt <= now && (
                    <span className="text-streak text-xs">مستحقة للمراجعة</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
