import { Flag, Lock, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHint } from "@/components/ui/card";
import { Num } from "@/components/ui/num";
import { Progress } from "@/components/ui/progress";
import { requireUser } from "@/features/auth/dal";
import { startLevelAction } from "@/features/games/actions";
import { getJourney } from "@/features/journey/service";
import { cn } from "@/lib/utils";

export const metadata = { title: "رحلة لفظي" };
const ERR: Record<string, string> = { locked: "اجتز المستويات السابقة أولًا.", content_unavailable: "هذا المستوى غير جاهز الآن — جرّب مستوى آخر.", not_found: "لم نجد هذا المستوى." };

/** The journey map: stages of short levels, opened in order; passed levels can be replayed for more stars. */
export default async function JourneyPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const { error } = await searchParams;
  const j = await getJourney(user.id);
  const cur = j.current;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <p className="text-secondary text-sm font-semibold">رحلة لفظي</p>
        <h1 className="text-2xl font-bold">مستوى بعد مستوى</h1>
        <p className="text-muted text-sm">كل مستوى يعلّمك نحو ١٠ كلمات: الكلمة التي تخطئ فيها تعود لك حتى تتقنها. كل خامس مستوى مراجعة، وفي آخر كل مرحلة اختبار إتقان (٩٠٪) يفتح المرحلة التالية.</p>
      </header>
      {error && ERR[error] && <p role="alert" className="bg-rose-soft text-rose rounded-xl px-4 py-3 text-sm">{ERR[error]}</p>}

      <Card className="space-y-3">
        {cur ? (
          <>
            <p className="text-muted text-sm">{cur.stageName}{cur.kind === "review" && " · مراجعة"}{cur.kind === "test" && " · اختبار المرحلة (٩٠٪ لتفتح المرحلة التالية)"}</p>
            <p className="font-display text-3xl font-bold">المستوى <Num value={cur.number} /></p>
            <form action={startLevelAction}>
              <input type="hidden" name="level" value={cur.number} />
              <Button size="lg" block className="h-16 text-xl"><Play aria-hidden className="size-6" /> ابدأ</Button>
            </form>
          </>
        ) : (
          <p className="font-display text-2xl font-bold">أنهيت كل المستويات المتاحة 🎉 مستويات جديدة تُضاف مع الكلمات الجديدة.</p>
        )}
        <div>
          <div className="flex justify-between text-sm"><span>تقدّمك في الرحلة</span><span className="font-num"><Num value={j.passedLevels} />/<Num value={j.totalLevels} /></span></div>
          <Progress value={j.passedLevels} max={Math.max(1, j.totalLevels)} label="المستويات المجتازة" className="mt-1 h-2.5" barClassName="bg-mint" />
        </div>
      </Card>

      {j.stages.map((s, si) => (
        <section key={`${s.id}-${si}`} className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold">{s.nameAr}</h2>
            <span className="text-muted font-num text-sm"><Num value={s.passed} />/<Num value={s.levels.length} /></span>
          </div>
          <ol className="grid grid-cols-5 gap-2 sm:grid-cols-8">
            {s.levels.map((l) => {
              const isCur = cur?.number === l.number;
              const inner = (
                <>
                  <span className="font-num text-base font-black">{l.kind === "review" ? <RefreshCw aria-hidden className="mx-auto size-4" /> : l.kind === "test" ? <Flag aria-hidden className="mx-auto size-4" /> : l.number}</span>
                  <span className="text-[0.6rem] leading-none tracking-tighter">
                    {l.locked ? <Lock aria-hidden className="mx-auto size-3" /> : l.passed ? [1, 2, 3].map((i) => <span key={i} className={i <= l.stars ? "text-sun" : "opacity-30"}>★</span>) : isCur ? "التالي" : ""}
                  </span>
                </>
              );
              const cls = cn(
                "grid aspect-square w-full place-items-center content-center gap-0.5 rounded-2xl border-2 text-center",
                l.passed ? "border-mint bg-mint-soft" : isCur ? "border-primary bg-primary-soft animate-pulse" : "border-border bg-surface text-muted",
              );
              return (
                <li key={l.number}>
                  {l.locked ? (
                    <div className={cls} aria-label={`المستوى ${l.number} مقفل`}>{inner}</div>
                  ) : (
                    <form action={startLevelAction}>
                      <input type="hidden" name="level" value={l.number} />
                      <button className={cls} aria-label={`${l.kind === "review" ? "مراجعة — " : l.kind === "test" ? "اختبار المرحلة — " : ""}المستوى ${l.number}${l.passed ? ` (${l.stars} نجوم)` : ""}`}>{inner}</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      <CardHint>اضغط على أي مستوى اجتزته لتعيده وتجمع نجومًا أكثر.</CardHint>
    </div>
  );
}
