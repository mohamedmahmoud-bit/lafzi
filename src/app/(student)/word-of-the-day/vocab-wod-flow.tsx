"use client";

import { ChevronLeft, PenLine, Repeat } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ChoiceList } from "@/components/app/choice-list";
import { RewardPanel } from "@/components/app/reward-panel";
import { Confetti } from "@/components/game/feedback";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHint } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import type { RewardSummary } from "@/features/gamification/rewards";
import { answerVocabWodAction, viewVocabWodAction } from "@/features/word-bank/actions";
import type { VocabWodView } from "@/features/word-bank/wod.service";

type Ready = Extract<VocabWodView, { status: "ready" }>;

/** Discover → guess the meaning → reveal the card → use the word. Then it enters spaced review. */
export function VocabWodFlow({ initial, categoryNames }: { initial: Ready; categoryNames: Record<string, string> }) {
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
    <div className="mx-auto max-w-xl space-y-4">
      <Card className="relative overflow-hidden text-center">
        {a?.isCorrect && <Confetti />}
        <Pill tone="primary">كلمة اليوم</Pill>
        <p className="font-display mt-3 text-6xl font-bold">{view.word}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-1">
          {view.categories.map((c) => <Pill key={c}>{categoryNames[c] ?? c}</Pill>)}
        </div>
      </Card>

      {error && <p role="alert" className="bg-rose-soft text-rose rounded-xl px-4 py-3 text-sm">{error}</p>}

      <Card className="space-y-4">
        <p className="text-center font-bold">{a ? (a.isCorrect ? "صح! هذا معناها" : "ليست هذه — المعنى الصحيح مظلل") : "خمّن: ما معنى الكلمة؟"}</p>
        <ChoiceList name="معنى الكلمة" choices={view.choices} selected={a?.choiceId ?? selected} correctId={a?.correctId ?? null} disabled={pending} onSelect={onSelect} cols={1} />
      </Card>

      {reward && <RewardPanel reward={reward} />}

      {view.card && (
        <Card className="animate-rise space-y-3">
          {view.card.meanings.map((m, i) => (
            <div key={i}>
              <p className="font-semibold">{m.text}</p>
              {m.example && <p className="text-muted text-sm">«{m.example}»</p>}
            </div>
          ))}
          {view.card.relations.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {view.card.relations.map((r, i) => (
                <li key={i} className="bg-surface-muted rounded-full px-3 py-1 text-sm">
                  <span className="text-muted">{r.direction === "to" ? r.label : `${r.label} لـ`}: </span>
                  <span className="font-display font-bold">{r.other}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="border-border flex items-start gap-2 rounded-xl border border-dashed px-3 py-2 text-sm">
            <PenLine aria-hidden className="text-primary-ink mt-0.5 size-4 shrink-0" />
            <p>تحدٍّ صغير: قل جملة من عندك فيها «{view.word}» — الآن، بصوت مسموع.</p>
          </div>
          <CardHint className="flex items-center gap-1"><Repeat aria-hidden className="size-4" /> حالتها: {view.card.mastery}. ستعود لك للمراجعة في الوقت المناسب.</CardHint>
        </Card>
      )}

      {a && <ButtonLink href="/" size="lg" block>تابع مهمة اليوم <ChevronLeft aria-hidden className="size-5" /></ButtonLink>}
    </div>
  );
}
