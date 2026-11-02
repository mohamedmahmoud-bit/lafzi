import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHint } from "@/components/ui/card";
import { Num } from "@/components/ui/num";
import { Pill } from "@/components/ui/pill";
import { Progress } from "@/components/ui/progress";
import { requireUser } from "@/features/auth/dal";
import { getTaxonomy } from "@/features/curriculum/service";
import { MASTERY_LABELS } from "@/features/vocabulary/srs";
import { knowledgeSummary, STUDY_FILTERS, studyWords, type StudyFilter } from "@/features/word-bank/study";
import { cn } from "@/lib/utils";

export const metadata = { title: "بنك الكلمات" };
const TONE = { learning: "xp", familiar: "primary", mastered: "success", new: "neutral" } as const;
const FILTER_AR: Record<StudyFilter, string> = { all: "كل الكلمات", mine: "كلماتي", known: "أعرفها", review: "حان وقت مراجعتها", new: "لم أجرّبها" };

/**
 * بنك الكلمات: the whole approved dictionary as a study resource. Meanings stay hidden until the
 * student taps a word (try to recall first), plus how many words they know overall and per section.
 */
export default async function WordsPage({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string; f?: string; page?: string; show?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tax = await getTaxonomy();
  const cats = tax.subskillsOf("vocabulary");
  const cat = cats.find((c) => c.id === sp.cat)?.id;
  const filter = (STUDY_FILTERS as readonly string[]).includes(sp.f ?? "") ? (sp.f as StudyFilter) : "all";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const showAll = sp.show === "1";
  const [summary, data] = await Promise.all([knowledgeSummary(user.id), studyWords(user.id, { q: sp.q, cat, filter, page })]);
  const pct = summary.total ? Math.round((summary.known / summary.total) * 100) : 0;
  const href = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q: sp.q, cat, f: filter === "all" ? undefined : filter, show: showAll ? "1" : undefined, ...o };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/words?${s}` : "/words";
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <p className="text-secondary text-sm font-semibold">بنك الكلمات</p>
        <h1 className="text-2xl font-bold">ذاكر كلمات القدرات</h1>
        <p className="text-muted text-sm">اقرأ الكلمة وحاول تتذكّر معناها، ثم اضغط عليها لترى المعنى.</p>
      </header>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-muted text-xs">مستواك في المفردات</p>
            <p className="font-display text-2xl font-bold">
              تعرف <Num value={summary.known} /> من <Num value={summary.total} /> كلمة
            </p>
          </div>
          <p className="font-num text-primary-ink text-3xl font-black"><Num value={pct} />٪</p>
        </div>
        <Progress value={summary.known} max={Math.max(1, summary.total)} label="الكلمات التي تعرفها" className="h-3" barClassName="bg-mint" />
        <p className="text-muted text-xs">
          أتقنت <Num value={summary.mastered} /> · تتعلّم الآن <Num value={summary.learning} />. «تعرفها» = أجبت عنها صح أكثر من مرة على فترات.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {summary.categories
            .map((c) => ({ ...c, name: cats.find((x) => x.id === c.id)?.nameAr }))
            .filter((c) => c.name)
            .map((c) => (
              <li key={c.id}>
                <Link href={href({ cat: c.id, page: undefined })} className="block">
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold">{c.name}</span>
                    <span className="text-muted font-num"><Num value={c.known} />/<Num value={c.total} /></span>
                  </div>
                  <Progress value={c.known} max={Math.max(1, c.total)} label={`${c.name}: الكلمات التي تعرفها`} className="mt-1 h-1.5" barClassName="bg-mint" />
                </Link>
              </li>
            ))}
        </ul>
      </Card>

      <form action="/words" className="flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="ابحث عن كلمة" className="border-border bg-surface min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm" />
        <select name="cat" defaultValue={cat ?? ""} className="border-border bg-surface rounded-xl border px-2 py-2 text-sm" aria-label="القسم">
          <option value="">كل الأقسام</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.nameAr}</option>)}
        </select>
        {filter !== "all" && <input type="hidden" name="f" value={filter} />}
        <button className="bg-primary text-primary-foreground rounded-xl px-4 py-2 text-sm font-bold">بحث</button>
      </form>

      <nav aria-label="تصفية" className="flex flex-wrap gap-2">
        {STUDY_FILTERS.map((f) => (
          <Link key={f} href={href({ f: f === "all" ? undefined : f, page: undefined })} aria-current={filter === f ? "page" : undefined} className={cn("border-border rounded-full border px-3 py-1 text-sm", filter === f && "border-primary bg-primary-soft text-primary-ink font-bold")}>
            {FILTER_AR[f]}
          </Link>
        ))}
        <Link href={href({ show: showAll ? undefined : "1" })} className="text-muted ms-auto px-1 py-1 text-sm underline">
          {showAll ? "أخفِ المعاني (اختبر نفسك)" : "اعرض كل المعاني"}
        </Link>
      </nav>

      <p className="text-muted text-sm"><Num value={data.total} /> كلمة</p>
      {data.words.length === 0 ? (
        <Card className="text-center">
          <p className="font-semibold">لا توجد كلمات هنا</p>
          <CardHint>جرّب تصفية أخرى، أو العب جولة لتبدأ مجموعتك.</CardHint>
          <ButtonLink href="/play" className="mt-3">العب جولة</ButtonLink>
        </Card>
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {data.words.map((w) => (
            <li key={w.id}>
              <details open={showAll} className="group bg-surface border-border h-full rounded-2xl border p-4">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-2">
                  <span>
                    <span className="font-display block text-2xl font-bold">{w.lemma}</span>
                    <span className="text-muted text-xs group-open:hidden">اضغط لترى المعنى</span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    {w.state !== "new" && <Pill tone={TONE[w.state]}>{MASTERY_LABELS[w.state]}</Pill>}
                    {w.due && <span className="text-xp text-xs font-semibold">راجعها الآن</span>}
                  </span>
                </summary>
                <div className="mt-2 space-y-1.5">
                  {w.meanings.map((m, i) => (
                    <p key={i} className="text-sm font-semibold">{m.text}{m.example && <span className="text-muted font-normal"> — «{m.example}»</span>}</p>
                  ))}
                  {w.relations.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5">
                      {w.relations.map((r, i) => (
                        <li key={i} className="bg-surface-muted rounded-full px-2.5 py-0.5 text-xs">
                          <span className="text-muted">{r.direction === "to" ? r.label : `${r.label} لـ`}: </span>
                          <span className="font-bold">{r.other}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {!w.meanings.length && !w.relations.length && <p className="text-muted text-sm">لا يوجد معنى معتمد بعد.</p>}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
      {data.pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? <Link href={href({ page: String(page - 1) })} className="font-semibold">→ السابق</Link> : <span />}
          <span className="text-muted">صفحة <Num value={page} /> من <Num value={data.pages} /></span>
          {page < data.pages ? <Link href={href({ page: String(page + 1) })} className="font-semibold">التالي ←</Link> : <span />}
        </div>
      )}
    </div>
  );
}
