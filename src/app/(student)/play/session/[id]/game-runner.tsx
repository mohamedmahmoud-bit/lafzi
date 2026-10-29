"use client";

import { BookOpen, ChevronLeft, Clock, Lightbulb, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ChoiceList, NoonExplanation } from "@/components/app/choice-list";
import { NoonCta } from "@/components/app/noon-cta";
import { RewardPanel } from "@/components/app/reward-panel";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHint, CardTitle } from "@/components/ui/card";
import { Num } from "@/components/ui/num";
import { Pill } from "@/components/ui/pill";
import { Progress } from "@/components/ui/progress";
import { answerRoundAction, completeGameAction, hintAction } from "@/features/games/actions";
import type { GameView } from "@/features/games/session.service";
import type { ClientRound, GameSummary } from "@/features/games/types";
import type { RewardSummary } from "@/features/gamification/rewards";

type Props = {
  view: GameView;
  game: { id: string; nameAr: string; topicId: string; topicName: string };
  subskillNames: Record<string, string>;
  next: { practiceHref: string; resources: { id: string; title: string; type: string; isDevExample: boolean }[] };
};

export function GameRunner({ view, game, subskillNames, next }: Props) {
  const [rounds, setRounds] = useState<ClientRound[]>(view.rounds);
  const firstOpen = useMemo(() => {
    const i = view.rounds.findIndex((r) => !r.answered);
    return i === -1 ? view.rounds.length - 1 : i;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [index, setIndex] = useState(firstOpen);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(view.score);
  const [result, setResult] = useState<(GameSummary & { rewards: RewardSummary }) | null>(view.summary as never);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const r = rounds[index];
  const answered = rounds.filter((x) => x.answered).length;
  const allAnswered = answered === rounds.length;
  const isLast = index === rounds.length - 1;

  const patch = (i: number, p: Partial<ClientRound>) => setRounds((rs) => rs.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const onSelect = (choiceId: string) => {
    setSelected(choiceId);
    start(async () => {
      const res = await answerRoundAction({ sessionId: view.id, round: index, choiceId });
      if (!res.ok) return setError(res.error);
      setError(null);
      setScore((s) => s + res.data.points);
      patch(index, {
        answered: { choiceId, isCorrect: res.data.isCorrect, correctId: res.data.correctId, explanation: res.data.explanation, points: res.data.points, hintUsed: !!r.hintRemoved },
      });
    });
  };

  const onHint = () =>
    start(async () => {
      const res = await hintAction({ sessionId: view.id, round: index });
      if (!res.ok) return setError(res.error);
      patch(index, { hintRemoved: res.data.removed });
    });

  const finish = () =>
    start(async () => {
      const res = await completeGameAction(view.id);
      if (!res.ok) return setError(res.error);
      setError(null);
      setResult(res.data);
      router.refresh();
    });

  if (result || view.status === "completed") {
    return <Results summary={result} game={game} subskillNames={subskillNames} next={next} />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <Link href={`/play/${game.id}`} aria-label="الخروج من الجولة" className="text-muted hover:bg-surface-muted grid size-9 place-items-center rounded-full">
          <X aria-hidden className="size-5" />
        </Link>
        <Progress value={answered} max={rounds.length} label="تقدم الجولة" className="h-3" />
        <span className="text-muted shrink-0 text-sm font-semibold">
          <Num value={index + 1} /> من <Num value={rounds.length} />
        </span>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="font-bold">{game.nameAr}</span>
        <span className="flex items-center gap-3">
          {view.timed && !r.answered && <Countdown key={index} ms={view.roundMs} />}
          <span className="text-xp font-semibold">نقاط <Num value={score} /></span>
        </span>
      </div>

      {error && <p role="alert" className="bg-danger-soft text-danger rounded-xl px-4 py-3 text-sm">{error}</p>}

      <Card key={index} className="animate-rise space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {r.kind === "relation_recall" ? <Pill tone="primary">بطاقة علاقة</Pill> : <Pill tone="primary">سؤال من بنك نون</Pill>}
          {r.subskillId && subskillNames[r.subskillId] && <Pill>{subskillNames[r.subskillId]}</Pill>}
        </div>
        {r.passage && (
          <details className="bg-surface-muted rounded-xl px-4 py-3" open>
            <summary className="cursor-pointer text-sm font-semibold">النص</summary>
            <p className="mt-2 leading-loose whitespace-pre-line">{r.passage}</p>
          </details>
        )}
        {r.kind === "relation_recall" && <p className="text-muted">ما العلاقة بين الكلمتين كما وردت في سؤال نون؟</p>}
        <p className="font-display text-center text-2xl leading-loose">{r.stem}</p>
        <ChoiceList
          name={r.stem}
          choices={r.choices}
          selected={r.answered?.choiceId ?? selected}
          correctId={r.answered?.correctId ?? null}
          removedId={r.hintRemoved}
          disabled={pending}
          onSelect={onSelect}
        />
        {!r.answered && r.kind === "noon_question" && r.choices.length > 2 && (
          <Button variant="ghost" size="sm" onClick={onHint} disabled={pending || !!r.hintRemoved}>
            <Lightbulb aria-hidden className="size-4" /> {r.hintRemoved ? "استخدمت التلميح" : "تلميح: احذف خيارًا خاطئًا"}
          </Button>
        )}
        {r.answered && (
          <div className="animate-rise space-y-3">
            <p className={`font-bold ${r.answered.isCorrect ? "text-success" : "text-xp"}`}>
              {r.answered.isCorrect ? <>صحيح! +<Num value={r.answered.points} /> نقطة</> : "ليست هذه. قبل قراءة الشرح: لماذا تظن أن الإجابة المظللة أدق؟"}
            </p>
            <NoonExplanation text={r.answered.explanation} noonQuestionId={r.noonQuestionId} />
          </div>
        )}
      </Card>

      {r.answered && !isLast && (
        <Button size="lg" block onClick={() => { setSelected(null); setIndex((i) => i + 1); }}>
          التالي <ChevronLeft aria-hidden className="size-5" />
        </Button>
      )}
      {allAnswered && isLast && (
        <Button size="lg" block variant="success" onClick={finish} disabled={pending}>
          {pending ? "جارٍ الحساب…" : "أنهِ الجولة واستلم نتيجتك"}
        </Button>
      )}
      {r.answered && isLast && !allAnswered && (
        <Button size="lg" block variant="outline" onClick={() => setIndex(rounds.findIndex((x) => !x.answered))}>
          ارجع للأسئلة التي لم تُجب عنها
        </Button>
      )}
    </div>
  );
}

function Results({ summary, game, subskillNames, next }: { summary: (GameSummary & { rewards?: RewardSummary }) | null } & Omit<Props, "view">) {
  if (!summary) return null;
  const pct = Math.round(summary.accuracy * 100);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card className="text-center">
        <p className="text-muted text-sm">{game.nameAr} · {game.topicName}</p>
        <h1 className="text-2xl font-bold">انتهت الجولة</h1>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat label="الدقة" value={<><Num value={pct} />٪</>} />
          <Stat label="صحيحة" value={<><Num value={summary.correct} /> / <Num value={summary.total} /></>} />
          <Stat label="النقاط" value={<Num value={summary.score} />} />
        </div>
      </Card>

      {summary.rewards && <RewardPanel reward={summary.rewards} />}

      {summary.subskills.length > 0 && (
        <Card>
          <CardTitle>أداؤك حسب المهارة</CardTitle>
          <CardHint>بيانات لفظي المحلية من هذه الجولة — ليست خريطة نون الرسمية.</CardHint>
          <ul className="mt-3 space-y-3">
            {summary.subskills.map((s) => (
              <li key={s.subskillId}>
                <div className="flex justify-between text-sm">
                  <span className="font-semibold">{subskillNames[s.subskillId] ?? s.nameAr}</span>
                  <span className="text-muted"><Num value={s.correct} /> من <Num value={s.total} /></span>
                </div>
                <Progress value={Math.round(s.masteryAfter * 100)} max={100} label={`إتقان ${s.nameAr}`} className="mt-1 h-2" />
                {s.masteryAfter > s.masteryBefore && <p className="text-success mt-0.5 text-xs">تحسّن الإتقان +<Num value={Math.round((s.masteryAfter - s.masteryBefore) * 100)} /> نقطة</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="space-y-3">
        <CardTitle>خطوتك التالية</CardTitle>
        {summary.weakest ? (
          <p className="text-sm">
            أكثر مهارة تحتاج تركيزًا: <strong>{subskillNames[summary.weakest.subskillId] ?? summary.weakest.nameAr}</strong>. راجع الأسئلة التي أخطأت فيها:
            ما الذي جعل الخيار الصحيح أدق؟ اكتب السبب بكلماتك.
          </p>
        ) : (
          <p className="text-sm">ممتاز — لم تخطئ في أي مهارة هذه الجولة. جرّب تحدي الوقت.</p>
        )}
        {next.resources.length > 0 && (
          <ul className="space-y-2">
            {next.resources.map((r) => (
              <li key={r.id}>
                <Link href={`/study/${r.id}`} className="hover:bg-surface-muted flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                  <BookOpen aria-hidden className="text-primary-ink size-4" />
                  <span className="flex-1">{r.title}</span>
                  {r.isDevExample && <Pill tone="dev">مثال للتطوير</Pill>}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <NoonCta href={next.practiceHref} size="lg" label="تدرّب على هذه المهارة في نون" />
      </Card>

      <div className="grid gap-2 sm:grid-cols-2">
        <ButtonLink href={`/play/${game.id}`} variant="outline" block>
          <RotateCcw aria-hidden className="size-4" /> جولة جديدة
        </ButtonLink>
        <ButtonLink href="/" variant="ghost" block>العودة للرئيسية</ButtonLink>
      </div>
    </div>
  );
}

/** Visual countdown only; the server measures time and decides the speed bonus. */
function Countdown({ ms }: { ms: number }) {
  const [left, setLeft] = useState(ms);
  useEffect(() => {
    const t0 = Date.now();
    const iv = setInterval(() => setLeft(Math.max(0, ms - (Date.now() - t0))), 250);
    return () => clearInterval(iv);
  }, [ms]);
  return (
    <span className="text-streak flex items-center gap-1 font-semibold" aria-live="off">
      <Clock aria-hidden className="size-4" /> <Num value={Math.ceil(left / 1000)} />
    </span>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-surface-muted rounded-xl px-2 py-3">
      <p className="text-muted text-xs">{label}</p>
      <p className="font-num text-xl font-bold">{value}</p>
    </div>
  );
}
