"use client";

import { ChevronLeft, PenLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ChoiceList, NoonExplanation } from "@/components/app/choice-list";
import { RewardPanel } from "@/components/app/reward-panel";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHint, CardTitle } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import type { RewardSummary } from "@/features/gamification/rewards";
import { answerVocabWodAction, viewVocabWodAction } from "@/features/word-bank/actions";
import type { VocabWodView } from "@/features/word-bank/wod.service";

type Ready = Extract<VocabWodView, { status: "ready" }>;
const REL = { synonym: "ترادف", antonym: "تضاد" } as const;

/**
 * Active-learning flow: (1) meet the word inside its ORIGINAL Noon question and answer it,
 * (2) explain the relation to yourself, (3) only then see the approved relation card.
 */
export function VocabWodFlow({ initial }: { initial: Ready }) {
  const [view, setView] = useState<Ready>(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [reward, setReward] = useState<RewardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (!initial.answered) void viewVocabWodAction();
  }, [initial.answered]);

  const onSelect = (id: string) => {
    setSelected(id);
    start(async () => {
      const res = await answerVocabWodAction(id);
      if (!res.ok) return setError(res.error);
      setError(null);
      const { view: next, ...r } = res.data;
      if (next.status === "ready") setView(next);
      setReward(r);
      router.refresh();
    });
  };

  const a = view.answered;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header className="text-center">
        <Pill tone="primary">كلمة اليوم</Pill>
        <p className="font-display mt-2 text-5xl font-bold">{view.word}</p>
        <p className="text-muted mt-1 text-sm">ظهرت هذه الكلمة في سؤال من بنك نون. حلّه أولًا.</p>
      </header>

      {error && <p role="alert" className="bg-danger-soft text-danger rounded-xl px-4 py-3 text-sm">{error}</p>}

      <Card className="space-y-4">
        <p className="text-muted text-sm">قبل النظر للخيارات: ما العلاقة بين كلمتي السؤال؟ قلها لنفسك بجملة.</p>
        <p className="font-display text-center text-2xl leading-loose">{view.question.stem}</p>
        <ChoiceList
          name={view.question.stem}
          choices={view.question.choices}
          selected={a?.choiceId ?? selected}
          correctId={a?.correctId ?? null}
          disabled={pending}
          onSelect={onSelect}
        />
        {a && (
          <div className="animate-rise space-y-3">
            <p className={`font-bold ${a.isCorrect ? "text-success" : "text-xp"}`}>
              {a.isCorrect ? "صحيح!" : "ليست هذه — قارن بين جملتك وبين الإجابة المظللة."}
            </p>
            <NoonExplanation text={a.explanation} noonQuestionId={view.question.noonQuestionId} />
          </div>
        )}
      </Card>

      {reward && <RewardPanel reward={reward} />}

      {view.card && (
        <Card className="animate-rise space-y-3">
          <CardTitle>بطاقة «{view.word}»</CardTitle>
          <ul className="space-y-2">
            {view.card.relations.map((r) => (
              <li key={`${r.type}-${r.other}`} className="bg-surface-muted flex flex-wrap items-center gap-2 rounded-xl px-3 py-2">
                <Pill tone={r.type === "synonym" ? "success" : "xp"}>{REL[r.type]}</Pill>
                <span className="font-display text-lg font-bold">{r.other}</span>
                <span className="text-muted ms-auto text-xs">
                  المصدر: سؤال نون <bdi className="font-num">{r.noonQuestionIds.join("، ")}</bdi>
                </span>
              </li>
            ))}
          </ul>
          <div className="text-sm">
            <p className="text-muted text-xs font-semibold">المعنى</p>
            {view.card.meaning ? (
              <p>
                {view.card.meaning}
                {view.card.meaningSource && <span className="text-muted text-xs"> — من شرح نون للسؤال <bdi className="font-num">{view.card.meaningSource}</bdi></span>}
              </p>
            ) : (
              <p className="text-muted">لا يوجد تعريف معتمد لهذه الكلمة.</p>
            )}
          </div>
          <div className="border-border flex items-start gap-2 rounded-xl border border-dashed px-3 py-2 text-sm">
            <PenLine aria-hidden className="text-primary-ink mt-0.5 size-4 shrink-0" />
            <p>اكتب في دفترك جملة من إنشائك تستخدم فيها «{view.word}»، ثم جملة أخرى بكلمتها المقابلة.</p>
          </div>
          <CardHint>ستعود الكلمة في «كنز الكلمات» للمراجعة المتباعدة.</CardHint>
        </Card>
      )}

      {a && (
        <ButtonLink href="/play/word_treasure" size="lg" block>
          تابع إلى كنز الكلمات <ChevronLeft aria-hidden className="size-5" />
        </ButtonLink>
      )}
    </div>
  );
}
