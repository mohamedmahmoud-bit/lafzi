"use client";

import { ChevronLeft, EyeOff, Lightbulb, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Illustration } from "@/components/app/brand-art";
import { FocusCard } from "@/components/app/focus-card";
import { QuestionOptions } from "@/components/app/question-options";
import { RewardPanel } from "@/components/app/reward-panel";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { answerWodAction, guessWodAction } from "@/features/daily-word/actions";
import type { WodView } from "@/features/daily-word/service";
import type { RewardSummary } from "@/features/gamification/rewards";
import type { FocusRecommendation } from "@/features/noon-integration/focus";
import type { SkillSummaryResult } from "@/features/noon-integration/types";

type Step = "guess" | "card" | "recall" | "done";
const DIFFICULTY = { 1: "سهلة", 2: "متوسطة", 3: "متقدمة" } as Record<number, string>;

type FocusProps = {
  summary: SkillSummaryResult;
  focus: FocusRecommendation | null;
  ctaHref: string;
  heatmapHref: string;
};

export function WodFlow({
  wod,
  practiceDone,
  focus,
}: {
  wod: WodView;
  practiceDone: boolean;
  focus: FocusProps;
}) {
  const [step, setStep] = useState<Step>(
    wod.status.answered ? "done" : wod.status.guessed ? "card" : "guess",
  );
  const [guess, setGuess] = useState({
    selected: null as string | null,
    correctId: wod.status.guessCorrectOptionId,
    correct: wod.status.guessCorrect,
  });
  const [answer, setAnswer] = useState({
    selected: wod.status.selectedOptionId,
    correctId: wod.status.correctOptionId,
    isCorrect: wod.status.isCorrect,
    explanation: wod.status.explanation,
  });
  const [reward, setReward] = useState<RewardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const stepIndex = { guess: 1, card: 2, recall: 3, done: 3 }[step];

  const onGuess = (id: string) => {
    setGuess((g) => ({ ...g, selected: id }));
    start(async () => {
      const res = await guessWodAction(id);
      if (!res.ok) return setError(res.error);
      setError(null);
      setGuess({ selected: id, correctId: res.data.correctOptionId, correct: res.data.correct });
    });
  };

  const onAnswer = (id: string) => {
    setAnswer((a) => ({ ...a, selected: id }));
    start(async () => {
      const res = await answerWodAction(id);
      if (!res.ok) return setError(res.error);
      setError(null);
      const { isCorrect, correctOptionId, explanation, ...r } = res.data;
      setAnswer({ selected: id, correctId: correctOptionId, isCorrect, explanation });
      setReward(r);
      router.refresh();
      setStep("done");
    });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-secondary flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles aria-hidden className="size-4" /> كلمة اليوم
          </p>
          <h1 className="text-2xl font-bold">
            {step === "guess"
              ? "استنتج المعنى بنفسك"
              : step === "card"
                ? "تعرّف على الكلمة"
                : step === "recall"
                  ? "هل تتذكر؟"
                  : "أحسنت التعلّم اليوم"}
          </h1>
        </div>
        <ol aria-label={`الخطوة ${stepIndex} من 3`} className="flex gap-1.5">
          {[1, 2, 3].map((i) => (
            <li
              key={i}
              aria-hidden
              className={`h-2 w-7 rounded-full ${i <= stepIndex ? "bg-primary" : "bg-surface-muted"}`}
            />
          ))}
        </ol>
      </header>

      {error && (
        <p role="alert" className="bg-danger-soft text-danger rounded-xl px-4 py-3 text-sm">
          {error}
        </p>
      )}

      {step === "guess" && (
        <Card className="animate-rise space-y-4">
          <div className="flex items-center gap-3">
            <Illustration name="char_pose_think" className="-my-2 h-auto w-16 shrink-0" />
            <p className="text-muted text-sm">
              اقرأ الجملة وركّز على الكلمة المظلّلة. لا بأس إن لم تعرفها — التخمين من السياق مهارة
              أساسية في القدرات.
            </p>
          </div>
          <blockquote className="bg-surface-muted font-display rounded-xl p-4 text-2xl leading-loose">
            <Highlighted sentence={wod.card.example} word={wod.card.word} />
          </blockquote>
          <p className="font-semibold">{wod.guess.prompt}</p>
          <QuestionOptions
            name="خمّن المعنى"
            options={wod.guess.options}
            selected={guess.selected}
            correctId={guess.correctId}
            disabled={pending}
            onSelect={onGuess}
          />
          {guess.correctId && (
            <div className="animate-rise space-y-3">
              <p
                className={`flex items-start gap-2 rounded-xl px-4 py-3 ${guess.correct ? "bg-success-soft text-success" : "bg-xp-soft text-xp"}`}
              >
                <Lightbulb aria-hidden className="mt-0.5 size-5 shrink-0" />
                {guess.correct
                  ? "استنتاج ممتاز! السياق قادك للمعنى الصحيح."
                  : "تخمين جيد! لاحظ كيف تلمّح الجملة للمعنى — سنكتشفه الآن."}
              </p>
              <Button block size="lg" onClick={() => setStep("card")}>
                اكشف بطاقة الكلمة <ChevronLeft aria-hidden className="size-5" />
              </Button>
            </div>
          )}
        </Card>
      )}

      {(step === "card" || step === "done") && <WordCard wod={wod} />}

      {step === "card" && (
        <Card className="animate-rise bg-primary-soft/40 space-y-3">
          <p className="flex items-center gap-2 font-semibold">
            <EyeOff aria-hidden className="text-primary-ink size-5" /> اقرأ البطاقة جيدًا — سنخفيها
            ونختبر ذاكرتك.
          </p>
          <p className="text-muted text-sm">
            الاسترجاع من الذاكرة يثبّت الكلمة أكثر من إعادة قراءتها.
          </p>
          <Button block size="lg" onClick={() => setStep("recall")}>
            أنا جاهز — اختبرني
          </Button>
        </Card>
      )}

      {step === "recall" && (
        <Card className="animate-rise space-y-4">
          <p className="text-muted text-sm">{wod.question.prompt}</p>
          {wod.question.stem && (
            <p className="font-display text-center text-4xl font-bold">{wod.question.stem}</p>
          )}
          <QuestionOptions
            name={wod.question.prompt}
            options={wod.question.options}
            selected={answer.selected}
            correctId={answer.correctId}
            disabled={pending}
            onSelect={onAnswer}
          />
          <button
            type="button"
            className="text-muted text-sm underline"
            onClick={() => setStep("card")}
          >
            أحتاج نظرة أخرى على البطاقة
          </button>
        </Card>
      )}

      {step === "done" && (
        <div className="space-y-4">
          {answer.correctId && (
            <Card className={answer.isCorrect ? "border-success/30" : "border-xp/30"}>
              <p className="font-bold">
                {answer.isCorrect ? "إجابة صحيحة ✓" : "ليست هذه المرة — والمهم أنك تعلّمت"}
              </p>
              {answer.explanation && <p className="text-muted mt-1">{answer.explanation}</p>}
              {!answer.isCorrect && (
                <p className="text-muted mt-1 text-sm">
                  سنعيد هذه الكلمة عليك قريبًا في تدريب الكلمات.
                </p>
              )}
            </Card>
          )}
          {reward && <RewardPanel reward={reward} />}
          {!practiceDone ? (
            <ButtonLink href="/practice" size="lg" block>
              الخطوة التالية: تدريب اليوم <ChevronLeft aria-hidden className="size-5" />
            </ButtonLink>
          ) : (
            <FocusCard {...focus} src="wod_done" compact />
          )}
        </div>
      )}
    </div>
  );
}

/** Highlights the whole token containing the word so Arabic letter joining isn't broken (بأناة). */
function Highlighted({ sentence, word }: { sentence: string; word: string }) {
  const i = sentence.indexOf(word);
  if (i === -1) return <>{sentence}</>;
  const isBoundary = (ch: string | undefined) => ch === undefined || /[\s،.؛:!؟«»"]/.test(ch);
  let start = i;
  while (!isBoundary(sentence[start - 1])) start--;
  let end = i + word.length;
  while (!isBoundary(sentence[end])) end++;
  return (
    <>
      {sentence.slice(0, start)}
      <mark className="bg-xp-soft text-xp rounded-md px-1 font-bold">
        {sentence.slice(start, end)}
      </mark>
      {sentence.slice(end)}
    </>
  );
}

function WordCard({ wod }: { wod: WodView }) {
  const c = wod.card;
  return (
    <Card className="animate-rise space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-primary-ink text-5xl leading-tight font-bold">{c.word}</p>
          <p className="mt-1 text-lg">{c.meaning}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Pill tone="primary">{DIFFICULTY[c.difficulty] ?? "متوسطة"}</Pill>
          <Pill>{c.category}</Pill>
        </div>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-success text-sm font-semibold">مرادفات</dt>
          <dd className="mt-1 flex flex-wrap gap-1.5">
            {c.synonyms.map((s) => (
              <Pill key={s} tone="success" className="text-sm">
                {s}
              </Pill>
            ))}
          </dd>
        </div>
        {c.antonyms.length > 0 && (
          <div>
            <dt className="text-danger text-sm font-semibold">أضداد</dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              {c.antonyms.map((s) => (
                <Pill key={s} tone="danger" className="text-sm">
                  {s}
                </Pill>
              ))}
            </dd>
          </div>
        )}
      </dl>
      <div>
        <p className="text-muted text-sm font-semibold">في جملة</p>
        <p className="font-display mt-1 text-xl leading-loose">
          <Highlighted sentence={c.example} word={c.word} />
        </p>
      </div>
      {c.relationNote && (
        <p className="bg-surface-muted rounded-xl px-4 py-3 text-sm">
          <strong>ارتباط لفظي: </strong>
          {c.relationNote}
        </p>
      )}
    </Card>
  );
}
