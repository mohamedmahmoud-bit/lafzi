import { and, asc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { Illustration } from "@/components/app/brand-art";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Num } from "@/components/ui/num";
import { Pill } from "@/components/ui/pill";
import { getDb } from "@/db/client";
import { noonQuestions, studentVocabularyProgress, vocabularyEntries, vocabularyQuestionSources } from "@/db/schema";
import { requireUser } from "@/features/auth/dal";
import { MASTERY_LABELS, type MasteryState } from "@/features/vocabulary/srs";
import { cn } from "@/lib/utils";

export const metadata = { title: "بنك الكلمات" };
const STATES: MasteryState[] = ["learning", "familiar", "mastered"];
const TONE = { learning: "xp", familiar: "primary", mastered: "success", new: "neutral" } as const;

/** The student's words — only approved entries derived from Noon questions, with their sources. */
export default async function WordsPage({ searchParams }: PageProps<"/words">) {
  const user = await requireUser();
  const { state } = await searchParams;
  const filter = STATES.includes(state as MasteryState) ? (state as MasteryState) : null;
  const db = getDb();
  const rows = await db
    .select({ id: vocabularyEntries.id, lemma: vocabularyEntries.lemma, meaning: vocabularyEntries.meaning, meaningStatus: vocabularyEntries.meaningStatus, state: studentVocabularyProgress.state, nextReviewAt: studentVocabularyProgress.nextReviewAt })
    .from(studentVocabularyProgress)
    .innerJoin(vocabularyEntries, eq(vocabularyEntries.id, studentVocabularyProgress.entryId))
    .where(and(eq(studentVocabularyProgress.userId, user.id), eq(vocabularyEntries.status, "approved"), filter ? eq(studentVocabularyProgress.state, filter) : undefined))
    .orderBy(asc(studentVocabularyProgress.nextReviewAt));
  const sources = rows.length
    ? await db
        .select({ entryId: vocabularyQuestionSources.entryId, noonId: noonQuestions.noonQuestionId })
        .from(vocabularyQuestionSources)
        .innerJoin(noonQuestions, eq(noonQuestions.id, vocabularyQuestionSources.questionId))
        .where(inArray(vocabularyQuestionSources.entryId, rows.map((r) => r.id)))
    : [];
  const now = new Date();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <p className="text-secondary text-sm font-semibold">بنك الكلمات</p>
        <h1 className="text-2xl font-bold">كلماتك (<Num value={rows.length} />)</h1>
        <p className="text-muted text-sm">كل كلمة هنا ظهرت في سؤال من بنك نون، وتمت مراجعتها قبل نشرها.</p>
      </header>
      <nav aria-label="تصفية حسب الإتقان" className="flex flex-wrap gap-2">
        {[null, ...STATES].map((s) => (
          <Link
            key={s ?? "all"}
            href={s ? `/words?state=${s}` : "/words"}
            aria-current={filter === s ? "page" : undefined}
            className={cn("border-border rounded-full border px-3 py-1 text-sm", filter === s && "border-primary bg-primary-soft text-primary-ink")}
          >
            {s ? MASTERY_LABELS[s] : "الكل"}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <Card className="text-center">
          <Illustration name="char_pose_book" className="mx-auto h-auto w-48" />
          <p className="mt-2 font-semibold">لا توجد كلمات بعد</p>
          <p className="text-muted text-sm">العب «كنز الكلمات» أو حلّ كلمة اليوم لتبدأ.</p>
          <ButtonLink href="/play/word_treasure" className="mt-3">كنز الكلمات</ButtonLink>
        </Card>
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {rows.map((w) => {
            const ids = [...new Set(sources.filter((s) => s.entryId === w.id).map((s) => s.noonId))];
            return (
              <li key={w.id}>
                <Card className="h-full p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display text-2xl font-bold">{w.lemma}</p>
                    <Pill tone={TONE[w.state]}>{MASTERY_LABELS[w.state]}</Pill>
                  </div>
                  <p className="text-muted mt-1 text-sm">{w.meaningStatus === "approved" && w.meaning ? w.meaning : "لا يوجد تعريف معتمد"}</p>
                  <p className="text-muted mt-2 text-xs">
                    المصدر: سؤال نون <bdi className="font-num">{ids.join("، ")}</bdi>
                    {w.nextReviewAt && w.nextReviewAt <= now && <span className="text-xp ms-2 font-semibold">حان وقت مراجعتها</span>}
                  </p>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
