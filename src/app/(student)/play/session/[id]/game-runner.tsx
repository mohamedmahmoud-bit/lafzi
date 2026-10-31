"use client";

import { ChevronLeft, Clock, Flame, Lightbulb, RotateCcw, Share2, Swords, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChoiceList } from "@/components/app/choice-list";
import { RewardPanel } from "@/components/app/reward-panel";
import { Confetti } from "@/components/game/feedback";
import { MatchBoard } from "@/components/game/match-board";
import { MemoryBoard } from "@/components/game/memory-board";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHint, CardTitle } from "@/components/ui/card";
import { Num } from "@/components/ui/num";
import { Progress } from "@/components/ui/progress";
import { answerRoundAction, completeGameAction, hintAction } from "@/features/games/actions";
import type { GameView } from "@/features/games/session.service";
import type { ClientRound, GameSummary } from "@/features/games/types";
import type { RewardSummary } from "@/features/gamification/rewards";
import { createChallengeAction } from "@/features/social/actions";
import { cn } from "@/lib/utils";

type Props = {
  view: GameView;
  game: { id: string; nameAr: string; canChallenge: boolean };
  subskillNames: Record<string, string>;
  challengeCode: string | null;
};

export function GameRunner({ view, game, subskillNames, challengeCode }: Props) {
  const [rounds, setRounds] = useState<ClientRound[]>(view.rounds);
  const [score, setScore] = useState(view.score);
  const [mistakes, setMistakes] = useState(view.mistakes);
  const [result, setResult] = useState<(GameSummary & { rewards?: RewardSummary }) | null>(view.summary);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const finishing = useRef(false);

  const answered = rounds.filter((r) => r.answered).length;
  const allAnswered = answered === rounds.length;
  const update = (i: number, p: Partial<ClientRound>) => setRounds((rs) => rs.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const patch = (i: number, a: ClientRound["answered"]) => update(i, { answered: a });

  const finish = useCallback(() => {
    if (finishing.current) return;
    finishing.current = true;
    start(async () => {
      const res = await completeGameAction(view.id);
      if (!res.ok) {
        finishing.current = false;
        return setError(res.error);
      }
      setError(null);
      setResult(res.data);
      router.refresh();
    });
  }, [view.id, router]);

  // Boards finish automatically once complete.
  useEffect(() => {
    if ((view.mechanic === "match" || view.mechanic === "memory") && allAnswered && !result && view.status === "in_progress") finish();
  }, [allAnswered, view.mechanic, result, view.status, finish]);

  if (result || view.status === "completed") {
    return <Results summary={result} game={game} subskillNames={subskillNames} challengeCode={challengeCode} kind={view.kind} />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <Link href={`/play/${game.id === "daily_challenge" ? "" : game.id}`} aria-label="خروج" className="text-muted hover:bg-surface-muted grid size-10 place-items-center rounded-full">
          <X aria-hidden className="size-5" />
        </Link>
        <Progress value={answered} max={rounds.length} label="التقدم" className="h-3" barClassName="bg-mint" />
        <span className="bg-sun-soft text-foreground font-num shrink-0 rounded-full px-3 py-1 text-sm font-bold">
          <Num value={score} />
        </span>
      </div>
      <p className="text-center text-sm font-bold">
        {game.nameAr}
        {view.kind === "challenge" && <span className="text-grape"> · تحدي صاحب</span>}
      </p>
      {error && <p role="alert" className="bg-rose-soft text-rose rounded-xl px-4 py-3 text-sm font-semibold">{error}</p>}

      {view.mechanic === "match" ? (
        <Card><MatchBoard sessionId={view.id} rounds={rounds} onUpdate={(i, a) => { patch(i, a); if (a?.isCorrect) setScore((s) => s + a.points); }} onError={setError} /></Card>
      ) : view.mechanic === "memory" ? (
        <Card>
          <MemoryBoard
            sessionId={view.id}
            rounds={rounds}
            mistakes={mistakes}
            onMistake={setMistakes}
            onError={setError}
            onMatched={(i, choiceId, points) => {
              patch(i, { choiceId, isCorrect: true, correctId: choiceId, explanation: rounds[i].answered?.explanation ?? null, points, hintUsed: false });
              setScore((s) => s + points);
            }}
          />
        </Card>
      ) : (
        <ChoiceRounds view={view} rounds={rounds} patch={patch} update={update} addScore={(p) => setScore((s) => s + p)} onError={setError} onFinish={finish} pending={pending} />
      )}
    </div>
  );
}

/** Multiple-choice rounds (صائد المعاني، الدخيلة، تحدي اليوم) and the timed race. */
function ChoiceRounds({ view, rounds, patch, update, addScore, onError, onFinish, pending }: { view: GameView; rounds: ClientRound[]; patch: (i: number, a: ClientRound["answered"]) => void; update: (i: number, p: Partial<ClientRound>) => void; addScore: (p: number) => void; onError: (e: string | null) => void; onFinish: () => void; pending: boolean }) {
  const race = view.mechanic === "race";
  const first = useMemo(() => {
    const i = view.rounds.findIndex((r) => !r.answered);
    return i === -1 ? view.rounds.length - 1 : i;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [index, setIndex] = useState(first);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [flash, setFlash] = useState<"ok" | "no" | null>(null);
  const r = rounds[index];
  const isLast = index === rounds.length - 1;
  const allAnswered = rounds.every((x) => x.answered);

  const next = useCallback(() => {
    setSelected(null);
    setFlash(null);
    const n = rounds.findIndex((x, j) => j > index && !x.answered);
    if (n !== -1) setIndex(n);
    else if (race) onFinish();
  }, [rounds, index, race, onFinish]);

  const onSelect = (choiceId: string) => {
    setSelected(choiceId);
    start(async () => {
      const res = await answerRoundAction({ sessionId: view.id, round: index, choiceId });
      if (!res.ok) {
        onError(res.error);
        if (res.error.includes("الوقت")) onFinish();
        return;
      }
      onError(null);
      addScore(res.data.points);
      patch(index, { choiceId, isCorrect: res.data.isCorrect, correctId: res.data.correctId, explanation: res.data.explanation, points: res.data.points, hintUsed: !!r.hintRemoved });
      setFlash(res.data.isCorrect ? "ok" : "no");
      if (race) setTimeout(next, res.data.isCorrect ? 450 : 1100);
    });
  };

  const onHint = () =>
    start(async () => {
      const res = await hintAction({ sessionId: view.id, round: index });
      if (!res.ok) return onError(res.error);
      update(index, { hintRemoved: res.data.removed });
      setSelected(null);
    });

  if (!r) return null;
  return (
    <>
      {race && view.deadlineAt && <RaceClock deadline={view.deadlineAt} onTimeUp={onFinish} />}
      <Card key={index} className={cn("animate-rise relative space-y-5", flash === "no" && "animate-shake")}>
        {flash === "ok" && <Confetti count={10} />}
        <p className="text-muted text-center text-sm font-semibold">{r.prompt ?? "اختر الإجابة الصحيحة"}</p>
        {r.kind !== "odd" && <p className="font-display text-center text-4xl leading-tight font-bold">{r.stem}</p>}
        <ChoiceList name={r.prompt ?? r.stem} choices={r.choices} selected={r.answered?.choiceId ?? selected} correctId={r.answered?.correctId ?? null} removedId={r.hintRemoved} disabled={busy || pending} onSelect={onSelect} cols={r.choices.some((c) => c.text.length > 18) ? 1 : 2} />
        {!race && !r.answered && r.choices.length > 3 && (
          <Button variant="ghost" size="sm" onClick={onHint} disabled={busy || !!r.hintRemoved}>
            <Lightbulb aria-hidden className="size-4" /> {r.hintRemoved ? "استخدمت التلميح" : "تلميح (نصف النقاط)"}
          </Button>
        )}
        {r.answered && !race && (
          <div className="animate-rise space-y-1">
            <p className={cn("text-lg font-bold", r.answered.isCorrect ? "text-mint" : "text-rose")}>
              {r.answered.isCorrect ? <>رائع! +<Num value={r.answered.points} /></> : "قريبة! تذكّر الإجابة المظللة"}
            </p>
            {r.answered.explanation && <p className="text-muted text-sm">{r.answered.explanation}</p>}
          </div>
        )}
      </Card>
      {!race && r.answered && !isLast && (
        <Button size="lg" block onClick={next}>التالي <ChevronLeft aria-hidden className="size-5" /></Button>
      )}
      {!race && allAnswered && (
        <Button size="lg" block variant="success" onClick={onFinish} disabled={pending}>{pending ? "لحظة…" : "النتيجة"}</Button>
      )}
      {!race && r.answered && isLast && !allAnswered && (
        <Button size="lg" block variant="outline" onClick={() => setIndex(rounds.findIndex((x) => !x.answered))}>أكمل الأسئلة المتبقية</Button>
      )}
    </>
  );
}

function RaceClock({ deadline, onTimeUp }: { deadline: string; onTimeUp: () => void }) {
  const end = useMemo(() => Date.parse(deadline), [deadline]);
  const [left, setLeft] = useState(() => Math.max(0, end - Date.now()));
  useEffect(() => {
    const iv = setInterval(() => {
      const l = Math.max(0, end - Date.now());
      setLeft(l);
      if (l === 0) {
        clearInterval(iv);
        onTimeUp();
      }
    }, 250);
    return () => clearInterval(iv);
  }, [end, onTimeUp]);
  const s = Math.ceil(left / 1000);
  return (
    <div className={cn("flex items-center justify-center gap-2 rounded-2xl py-2 text-lg font-bold", s <= 10 ? "bg-rose-soft text-rose" : "bg-sky-soft text-sky")} aria-live="off">
      <Clock aria-hidden className="size-5" /> <Num value={s} /> ث
    </div>
  );
}

function Results({ summary, game, subskillNames, challengeCode, kind }: { summary: (GameSummary & { rewards?: RewardSummary }) | null; game: Props["game"]; subskillNames: Record<string, string>; challengeCode: string | null; kind: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!summary) return null;
  const pct = Math.round(summary.accuracy * 100);
  const cheer = pct >= 90 ? "أسطوري!" : pct >= 70 ? "ممتاز!" : pct >= 50 ? "أحسنت!" : "بداية جيدة — جولة ثانية وتتحسّن";

  const challenge = () =>
    start(async () => {
      const res = await createChallengeAction(game.id);
      if (!res.ok) return setErr(res.error);
      const url = `${location.origin}/c/${res.data.code}`;
      setLink(url);
      const text = `تحدّاني في «${game.nameAr}» على لفظي! هل تغلبني؟`;
      if (navigator.share) await navigator.share({ title: "تحدي لفظي", text, url }).catch(() => undefined);
      else await navigator.clipboard?.writeText(`${text} ${url}`).catch(() => undefined);
      router.push(`/play/session/${res.data.sessionId}`);
    });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card className="relative overflow-hidden text-center">
        {pct >= 70 && <Confetti />}
        <p className="text-muted text-sm">{game.nameAr}</p>
        <h1 className="font-display text-3xl font-bold">{cheer}</h1>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat label="النقاط" value={<Num value={summary.score} />} tone="bg-sun-soft" />
          <Stat label="الدقة" value={<><Num value={pct} />٪</>} tone="bg-mint-soft" />
          <Stat label="صحيحة" value={<><Num value={summary.correct} /> من <Num value={summary.total} /></>} tone="bg-sky-soft" />
        </div>
      </Card>

      {summary.rewards && <RewardPanel reward={summary.rewards} />}

      {kind === "challenge" && challengeCode && (
        <ButtonLink href={`/c/${challengeCode}`} size="lg" block variant="outline">
          <Swords aria-hidden className="size-5" /> نتيجة التحدي
        </ButtonLink>
      )}

      {summary.subskills.length > 0 && (
        <Card>
          <CardTitle>تقدّمك</CardTitle>
          <ul className="mt-3 space-y-3">
            {summary.subskills.map((s) => (
              <li key={s.subskillId}>
                <div className="flex justify-between text-sm">
                  <span className="font-semibold">{subskillNames[s.subskillId] ?? s.nameAr}</span>
                  <span className="text-muted"><Num value={s.correct} /> من <Num value={s.total} /></span>
                </div>
                <Progress value={Math.round(s.masteryAfter * 100)} max={100} label={`إتقان ${s.nameAr}`} className="mt-1 h-2" barClassName="bg-mint" />
              </li>
            ))}
          </ul>
          <CardHint className="mt-2">الكلمات التي أخطأت فيها ستعود لك قريبًا للمراجعة.</CardHint>
        </Card>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {game.canChallenge && kind !== "challenge" && (
          <Button size="lg" block onClick={challenge} disabled={pending} className="bg-grape text-white">
            <Share2 aria-hidden className="size-5" /> {pending ? "لحظة…" : "تحدَّ صاحبك"}
          </Button>
        )}
        <ButtonLink href={game.id === "daily_challenge" ? "/play" : `/play/${game.id}`} size="lg" variant="outline" block>
          <RotateCcw aria-hidden className="size-4" /> العب مرة ثانية
        </ButtonLink>
        <ButtonLink href="/" variant="ghost" block>
          <Flame aria-hidden className="text-flame size-4" /> الرئيسية
        </ButtonLink>
      </div>
      {link && <p className="text-muted text-center text-xs break-all" dir="ltr">{link}</p>}
      {err && <p className="text-rose text-center text-sm">{err}</p>}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone: string }) {
  return (
    <div className={cn("rounded-2xl px-2 py-3", tone)}>
      <p className="text-muted text-xs">{label}</p>
      <p className="font-num text-2xl font-bold">{value}</p>
    </div>
  );
}
