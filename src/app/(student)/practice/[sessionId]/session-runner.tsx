"use client";

import { ChevronLeft, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { FocusCard } from "@/components/app/focus-card";
import { QuestionOptions } from "@/components/app/question-options";
import { RewardPanel } from "@/components/app/reward-panel";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Num } from "@/components/ui/num";
import { Pill } from "@/components/ui/pill";
import { Progress } from "@/components/ui/progress";
import type { FocusRecommendation } from "@/features/noon-integration/focus";
import type { SkillSummaryResult } from "@/features/noon-integration/types";
import { answerItemAction, completeSessionAction } from "@/features/vocabulary/actions";
import { QUESTION_TYPE_LABELS } from "@/features/vocabulary/questions";
import type { SessionCompletion, SessionView } from "@/features/vocabulary/session.service";

type Answer = SessionView["answers"][number];
type FocusProps = {
  summary: SkillSummaryResult;
  focus: FocusRecommendation | null;
  ctaHref: string;
  heatmapHref: string;
};

export function SessionRunner({ view, focus }: { view: SessionView; focus: FocusProps }) {
  const [answers, setAnswers] = useState<Map<number, Answer>>(
    () => new Map(view.answers.map((a) => [a.index, a])),
  );
  const firstUnanswered = useMemo(() => {
    const i = view.questions.findIndex((_, idx) => !answers.has(idx));
    return i === -1 ? view.questions.length - 1 : i;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [index, setIndex] = useState(firstUnanswered);
  const [selected, setSelected] = useState<string | null>(null);
  const [completion, setCompletion] = useState<SessionCompletion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const q = view.questions[index];
  const answer = answers.get(index);
  const allAnswered = answers.size === view.questions.length;
  const correct = [...answers.values()].filter((a) => a.isCorrect).length;
  const isLast = index === view.questions.length - 1;

  const onSelect = (optionId: string) => {
    setSelected(optionId);
    start(async () => {
      const res = await answerItemAction({ sessionId: view.id, index, optionId });
      if (!res.ok) return setError(res.error);
      setError(null);
      setAnswers((m) => new Map(m).set(index, { index, selectedOptionId: optionId, ...res.data }));
    });
  };

  const next = () => {
    setSelected(null);
    setIndex((i) => Math.min(i + 1, view.questions.length - 1));
  };

  const finish = () =>
    start(async () => {
      const res = await completeSessionAction(view.id);
      if (!res.ok) return setError(res.error);
      setError(null);
      setCompletion(res.data);
      router.refresh();
    });

  if (completion || view.status === "completed") {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Card className="text-center">
          <p className="text-muted text-sm">
            {view.kind === "daily" ? "تدريب اليوم" : "جلسة مراجعة"}
          </p>
          <h1 className="text-2xl font-bold">انتهت الجلسة</h1>
          <p className="mt-1 text-lg">
            أجبت صح عن{" "}
            <strong className="text-success">
              <Num value={completion?.correct ?? correct} />
            </strong>{" "}
            من <Num value={view.total} />
          </p>
        </Card>
        {completion && <RewardPanel reward={completion} />}
        <FocusCard {...focus} src="session_done" compact />
        <div className="grid gap-2 sm:grid-cols-2">
          <ButtonLink href="/" variant="outline" block>
            العودة للرئيسية
          </ButtonLink>
          <ButtonLink href="/words" variant="ghost" block>
            راجع بنك الكلمات
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/practice"
          aria-label="الخروج من الجلسة"
          className="text-muted hover:bg-surface-muted grid size-9 place-items-center rounded-full"
        >
          <X aria-hidden className="size-5" />
        </Link>
        <Progress value={answers.size} max={view.total} label="تقدم الجلسة" className="h-3" />
        <span className="text-muted shrink-0 text-sm font-semibold">
          <Num value={index + 1} /> من <Num value={view.total} />
        </span>
      </div>

      {error && (
        <p role="alert" className="bg-danger-soft text-danger rounded-xl px-4 py-3 text-sm">
          {error}
        </p>
      )}

      <Card key={index} className="animate-rise space-y-5">
        <div className="flex items-center justify-between">
          <Pill tone={q.type === "analogy" ? "xp" : "primary"}>
            {q.type === "analogy" ? "تحدٍّ لفظي" : QUESTION_TYPE_LABELS[q.type]}
          </Pill>
        </div>
        <p className="text-muted">{q.prompt}</p>
        {q.stem && (
          <p
            className={
              q.type === "context" || q.type === "analogy"
                ? "font-display text-center text-2xl leading-loose"
                : "font-display text-center text-4xl font-bold"
            }
          >
            {q.stem}
          </p>
        )}
        <QuestionOptions
          name={q.prompt}
          options={q.options}
          selected={answer?.selectedOptionId ?? selected}
          correctId={answer?.correctOptionId ?? null}
          disabled={pending}
          onSelect={onSelect}
        />
        {answer && (
          <div
            className={`animate-rise rounded-xl px-4 py-3 ${answer.isCorrect ? "bg-success-soft" : "bg-xp-soft"}`}
          >
            <p className={`font-bold ${answer.isCorrect ? "text-success" : "text-xp"}`}>
              {answer.isCorrect ? "صحيح!" : "ليست هذه — لاحظ:"}
            </p>
            <p className="mt-0.5">{answer.explanation}</p>
          </div>
        )}
      </Card>

      {answer && !isLast && (
        <Button size="lg" block onClick={next}>
          التالي <ChevronLeft aria-hidden className="size-5" />
        </Button>
      )}
      {allAnswered && isLast && (
        <Button size="lg" block variant="success" onClick={finish} disabled={pending}>
          {pending ? "جارٍ الحفظ…" : "أنهِ الجلسة واستلم نقاطك"}
        </Button>
      )}
      {answer && isLast && !allAnswered && (
        <Button
          size="lg"
          block
          variant="outline"
          onClick={() => setIndex(view.questions.findIndex((_, i) => !answers.has(i)))}
        >
          ارجع للأسئلة التي لم تُجب عنها
        </Button>
      )}
    </div>
  );
}
