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
import { Card, CardHint } from "@/components/ui/card";
import { Num } from "@/components/ui/num";
import { Progress } from "@/components/ui/progress";
import { answerRoundAction, completeGameAction, hintAction, startGameAction, startLevelAction } from "@/features/games/actions";
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
  const append = (r: ClientRound) => setRounds((rs) => (rs.some((x) => x.index === r.index) ? rs : [...rs, r]));

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
    return <Results summary={result} game={game} subskillNames={subskillNames} challengeCode={challengeCode} kind={view.kind} categoryId={view.categoryId} />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <Link href={view.level ? "/journey" : `/play/${game.id === "daily_challenge" ? "" : game.id}`} aria-label="خروج" className="text-muted hover:bg-surface-muted grid size-10 place-items-center rounded-full">
          <X aria-hidden className="size-5" />
        </Link>
        <Progress value={answered} max={rounds.length} label="الأسئلة المجاب عنها" className="h-3" barClassName="bg-mint" />
        {view.mechanic !== "race" && (
          <span className="text-muted font-num shrink-0 text-sm font-bold" aria-hidden>
            <Num value={answered} /> من <Num value={rounds.length} />
          </span>
        )}
        <span className="bg-sun-soft text-foreground font-num shrink-0 rounded-full px-3 py-1 text-sm font-bold">
          <Num value={score} />
        </span>
      </div>
      <p className="text-center text-sm font-bold">
        {view.level
          ? view.levelMode === "corrective"
            ? `رحلة لفظي · مراجعة ما فاتك في اختبار المرحلة`
            : view.levelKind === "test"
              ? `رحلة لفظي · اختبار المرحلة (المستوى ${view.level})`
              : `رحلة لفظي · المستوى ${view.level}${view.levelKind === "review" ? " · مراجعة" : ""}`
          : game.nameAr}
        {view.kind === "challenge" && <span className="text-grape"> · تحدي صاحب</span>}
        {view.categoryId && subskillNames[view.categoryId] && <span className="text-sky"> · {subskillNames[view.categoryId]}</span>}
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
        <ChoiceRounds view={view} rounds={rounds} patch={patch} update={update} append={append} addScore={(p) => setScore((s) => s + p)} onError={setError} onFinish={finish} pending={pending} />
      )}
    </div>
  );
}

/**
 * Pace after an answer: a correct answer moves on fast. A mistake stays until the student taps
 * «فهمت» so they can actually read the right answer (only the race keeps moving, the clock is on).
 */
const NEXT_AFTER_CORRECT_MS = 600;
const RACE_NEXT_AFTER_WRONG_MS = 1500;

/**
 * Multiple-choice rounds (صائد المعاني، تحدي اليوم، السباق). A correct answer advances by itself;
 * after a mistake the right answer stays until «فهمت — التالي» (the race moves on by itself).
 */
function ChoiceRounds({ view, rounds, patch, update, append, addScore, onError, onFinish, pending }: { view: GameView; rounds: ClientRound[]; patch: (i: number, a: ClientRound["answered"]) => void; update: (i: number, p: Partial<ClientRound>) => void; append: (r: ClientRound) => void; addScore: (p: number) => void; onError: (e: string | null) => void; onFinish: () => void; pending: boolean }) {
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
  const [comesBack, setComesBack] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const r = rounds[index];

  // Every round already answered (e.g. reopened page) → straight to the results.
  useEffect(() => {
    if (rounds.length && rounds.every((x) => x.answered)) onFinish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const advance = useCallback(
    (from: number, answeredNow: number) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      setSelected(null);
      setFlash(null);
      setComesBack(false);
      const n = rounds.findIndex((x, j) => j !== from && j !== answeredNow && !x.answered);
      if (n === -1) onFinish();
      else setIndex(n);
    },
    [rounds, onFinish],
  );

  const onSelect = (choiceId: string) => {
    if (r.answered || busy) return;
    setSelected(choiceId);
    const at = index;
    start(async () => {
      const res = await answerRoundAction({ sessionId: view.id, round: at, choiceId });
      if (!res.ok) {
        onError(res.error);
        if (res.error.includes("الوقت")) onFinish();
        return;
      }
      onError(null);
      addScore(res.data.points);
      patch(at, { choiceId, isCorrect: res.data.isCorrect, correctId: res.data.correctId, explanation: res.data.explanation, points: res.data.points, hintUsed: !!r.hintRemoved });
      if (res.data.appended) {
        append(res.data.appended);
        setComesBack(true);
      }
      setFlash(res.data.isCorrect ? "ok" : "no");
      if (res.data.isCorrect) timer.current = setTimeout(() => advance(at, at), NEXT_AFTER_CORRECT_MS);
      else if (race) timer.current = setTimeout(() => advance(at, at), RACE_NEXT_AFTER_WRONG_MS);
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
  const waitingAfterMistake = !!r.answered && !r.answered.isCorrect;
  return (
    <>
      {race && view.deadlineAt && <RaceClock deadline={view.deadlineAt} onTimeUp={onFinish} />}
      <Card
        key={index}
        className={cn("animate-rise relative space-y-5", flash === "no" && "animate-shake", waitingAfterMistake && race && "cursor-pointer")}
        onClick={waitingAfterMistake && race ? () => advance(index, index) : undefined}
      >
        {flash === "ok" && <Confetti count={10} />}
        <p className="text-muted text-center text-sm font-semibold">{r.prompt ?? "اختر الإجابة الصحيحة"}</p>
        {r.kind !== "odd" && <p className={cn("font-display text-center leading-snug font-bold", r.stem.length > 28 ? "text-2xl" : "text-4xl")}>{r.stem}</p>}
        <ChoiceList name={r.prompt ?? r.stem} choices={r.choices} selected={r.answered?.choiceId ?? selected} correctId={r.answered?.correctId ?? null} removedId={r.hintRemoved} disabled={busy || pending} onSelect={onSelect} cols={r.choices.some((c) => c.text.length > 18) ? 1 : 2} />
        {!race && !r.answered && r.choices.length > 3 && (
          <Button variant="ghost" size="sm" onClick={onHint} disabled={busy || !!r.hintRemoved}>
            <Lightbulb aria-hidden className="size-4" /> {r.hintRemoved ? "استخدمت التلميح" : "تلميح (نصف النقاط)"}
          </Button>
        )}
        {r.answered && (
          <div className="animate-rise space-y-1" aria-live="polite">
            <p className={cn("text-lg font-bold", r.answered.isCorrect ? "text-mint" : "text-rose")}>
              {r.answered.isCorrect ? <>صح! +<Num value={r.answered.points} /></> : "خطأ — الإجابة الصحيحة مظللة"}
            </p>
            {!r.answered.isCorrect && r.answered.explanation && <p className="text-muted text-sm">{r.answered.explanation}</p>}
            {comesBack && <p className="bg-sky-soft text-sky rounded-xl px-3 py-2 text-sm font-semibold">🔁 ستعود لك هذه الكلمة بعد قليل — ركّز على الإجابة الصحيحة.</p>}
            {waitingAfterMistake && !race && (
              <Button size="lg" block className="mt-2" onClick={(e) => { e.stopPropagation(); advance(index, index); }}>
                فهمت — التالي
              </Button>
            )}
          </div>
        )}
      </Card>
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

function Results({ summary, game, challengeCode, kind, categoryId }: { summary: (GameSummary & { rewards?: RewardSummary }) | null; game: Props["game"]; subskillNames: Record<string, string>; challengeCode: string | null; kind: string; categoryId: string | null }) {
  const [link, setLink] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!summary) return null;
  const pct = Math.round(summary.accuracy * 100);
  const lv = summary.level;
  const cheer = lv
    ? lv.kind === "corrective"
      ? "راجعت الكلمات التي فاتتك ✓"
      : lv.kind === "test"
        ? lv.passed
          ? "اجتزت اختبار المرحلة ✓"
          : "لم تجتز اختبار المرحلة بعد"
        : lv.passed
          ? `أتقنت المستوى ${lv.number} ✓`
          : `لم تكمل المستوى ${lv.number} بعد`
    : pct >= 90 ? "أسطوري!" : pct >= 70 ? "ممتاز!" : pct >= 50 ? "أحسنت!" : "بداية جيدة — جولة ثانية وتتحسّن";

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
        {lv?.passed && (
          <p className="mt-1 text-4xl tracking-widest" aria-label={`${lv.stars} من ٣ نجوم`}>
            {[1, 2, 3].map((i) => <span key={i} className={i <= lv.stars ? "text-sun" : "text-border"}>★</span>)}
          </p>
        )}
        {lv?.kind === "test" && !lv.passed && (
          <p className="text-muted mt-1 text-sm">
            تحتاج <Num value={lv.passMark ?? 0} /> من <Num value={summary.total} /> لتفتح المرحلة التالية. راجع الكلمات التي فاتتك ثم أعد الاختبار.
          </p>
        )}
        {lv?.kind === "corrective" && <p className="text-muted mt-1 text-sm">الآن أعد اختبار المرحلة لتفتح ما بعدها.</p>}
        {lv && lv.kind !== "test" && lv.kind !== "corrective" && lv.passed && <p className="text-muted mt-1 text-sm">أجبت عن كل كلمات المستوى إجابة صحيحة.</p>}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat label="النقاط" value={<Num value={summary.score} />} tone="bg-sun-soft" />
          {lv && lv.kind !== "test" ? (
            <>
              <Stat label="من أول محاولة" value={<><Num value={lv.firstTry} /> من <Num value={lv.items} /></>} tone="bg-mint-soft" />
              <Stat label="كلمات أتقنتها" value={<><Num value={lv.passed || lv.kind === "corrective" ? lv.items : lv.firstTry} /> من <Num value={lv.items} /></>} tone="bg-sky-soft" />
            </>
          ) : (
            <>
              <Stat label="الدقة" value={<><Num value={pct} />٪</>} tone="bg-mint-soft" />
              <Stat label="صحيحة" value={<><Num value={summary.correct} /> من <Num value={summary.total} /></>} tone="bg-sky-soft" />
            </>
          )}
        </div>
      </Card>

      {summary.rewards && <RewardPanel reward={summary.rewards} />}

      {kind === "challenge" && challengeCode && (
        <ButtonLink href={`/c/${challengeCode}`} size="lg" block variant="outline">
          <Swords aria-hidden className="size-5" /> نتيجة التحدي
        </ButtonLink>
      )}

      {summary.total > summary.correct && <CardHint className="text-center">الكلمات التي أخطأت فيها ستعود لك قريبًا للمراجعة.</CardHint>}

      {/* One obvious next step: the next level (or a retry), otherwise keep going in the same game. */}
      {lv ? (
        <>
          {lv.kind === "test" && !lv.passed && (lv.missed ?? 0) > 0 ? (
            <form action={startLevelAction}>
              <input type="hidden" name="level" value={lv.number} />
              <input type="hidden" name="mode" value="corrective" />
              <Button size="lg" block className="h-16 text-xl">راجع الكلمات التي فاتتك (<Num value={lv.missed ?? 0} />) <ChevronLeft aria-hidden className="size-6" /></Button>
            </form>
          ) : (
            <form action={startLevelAction}>
              <input type="hidden" name="level" value={lv.nextNumber ?? lv.number} />
              <Button size="lg" block className="h-16 text-xl" disabled={lv.passed && lv.nextNumber === null}>
                {lv.kind === "corrective" ? "أعد اختبار المرحلة" : !lv.passed ? (lv.kind === "test" ? "أعد الاختبار" : "حاول مرة أخرى") : lv.nextNumber ? `المستوى ${lv.nextNumber}` : "أنهيت كل المستويات! 🎉"} <ChevronLeft aria-hidden className="size-6" />
              </Button>
            </form>
          )}
          {lv.kind === "test" && !lv.passed && (lv.missed ?? 0) > 0 && (
            <form action={startLevelAction}>
              <input type="hidden" name="level" value={lv.number} />
              <Button size="lg" variant="outline" block>أعد الاختبار مباشرة</Button>
            </form>
          )}
        </>
      ) : (
        <form action={startGameAction}>
          <input type="hidden" name="gameId" value={game.id === "daily_challenge" ? "meaning_hunter" : game.id} />
          {categoryId && game.id !== "daily_challenge" && <input type="hidden" name="category" value={categoryId} />}
          <Button size="lg" block className="h-16 text-xl">
            {game.id === "daily_challenge" ? "العب جولة في صائد المعاني" : "الجولة التالية"} <ChevronLeft aria-hidden className="size-6" />
          </Button>
        </form>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {game.canChallenge && kind !== "challenge" && (
          <Button size="lg" block variant="outline" onClick={challenge} disabled={pending}>
            <Share2 aria-hidden className="size-5" /> {pending ? "لحظة…" : "تحدَّ صاحبك"}
          </Button>
        )}
        <ButtonLink href={lv ? "/journey" : "/play"} size="lg" variant="outline" block>
          <RotateCcw aria-hidden className="size-4" /> {lv ? "خريطة الرحلة" : "لعبة أخرى"}
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
