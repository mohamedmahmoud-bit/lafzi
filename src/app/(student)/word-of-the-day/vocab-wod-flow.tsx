"use client";

import { Check, ChevronLeft, Eye, PenLine, Repeat, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RewardPanel } from "@/components/app/reward-panel";
import { Confetti } from "@/components/game/feedback";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHint } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { WordMedia } from "@/components/word-media";
import type { RewardSummary } from "@/features/gamification/rewards";
import { rateVocabWodAction, revealVocabWodAction } from "@/features/word-bank/actions";
import type { VocabWodView } from "@/features/word-bank/wod.service";

type Ready = Extract<VocabWodView, { status: "ready" }>;

/** Flashcard: recall the meaning in your head → reveal → say honestly whether you knew it. */
export function VocabWodFlow({ initial, categoryNames }: { initial: Ready; categoryNames: Record<string, string> }) {
  const [view, setView] = useState<Ready>(initial);
  const [reward, setReward] = useState<RewardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const reveal = () =>
    start(async () => {
      const res = await revealVocabWodAction();
      if (!res.ok) return setError(res.error);
      if (res.data.status === "ready") setView(res.data);
    });
  const rate = (knew: boolean) =>
    start(async () => {
      const res = await rateVocabWodAction(knew);
      if (!res.ok) return setError(res.error);
      const { view: next, ...r } = res.data;
      if (next.status === "ready") setView(next);
      setReward(r);
      router.refresh();
    });

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Card className="relative overflow-hidden text-center">
        {view.rated?.knew && <Confetti />}
        <Pill tone="primary">كلمة اليوم</Pill>
        <p className="font-display mt-3 text-6xl leading-snug font-bold">{view.word}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-1">
          {view.categories.map((c) => <Pill key={c}>{categoryNames[c] ?? c}</Pill>)}
        </div>
        {!view.revealed && <p className="text-muted mt-4">فكّر: ما معناها؟ قلها لنفسك قبل أن تكشف البطاقة.</p>}
      </Card>

      {error && <p role="alert" className="bg-rose-soft text-rose rounded-xl px-4 py-3 text-sm">{error}</p>}

      {!view.revealed ? (
        <Button size="lg" block onClick={reveal} disabled={pending} className="h-14 text-lg">
          <Eye aria-hidden className="size-5" /> اكشف المعنى
        </Button>
      ) : (
        view.card && (
          <Card className="animate-rise space-y-3">
            {view.card.meanings.map((m, i) => (
              <div key={i}>
                <p className="text-lg font-semibold">{m.text}</p>
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
            <WordMedia word={view.word} items={view.card.media} />
          </Card>
        )
      )}

      {view.revealed && !view.rated && (
        <div className="grid grid-cols-2 gap-2">
          <Button size="lg" variant="outline" onClick={() => rate(false)} disabled={pending}><X aria-hidden className="text-rose size-5" /> ما عرفتها</Button>
          <Button size="lg" onClick={() => rate(true)} disabled={pending} className="bg-mint text-white"><Check aria-hidden className="size-5" /> عرفتها</Button>
        </div>
      )}

      {reward && <RewardPanel reward={reward} />}

      {view.rated && view.card && (
        <Card className="space-y-2">
          <div className="border-border flex items-start gap-2 rounded-xl border border-dashed px-3 py-2 text-sm">
            <PenLine aria-hidden className="text-primary-ink mt-0.5 size-4 shrink-0" />
            <p>قل جملة من عندك فيها «{view.word}» — الآن، بصوت مسموع.</p>
          </div>
          <CardHint className="flex items-center gap-1"><Repeat aria-hidden className="size-4" /> {view.rated.knew ? "ممتاز — ستعود لك بعد فترة لتثبيتها." : "ستعود لك قريبًا للمراجعة."} حالتها: {view.card.mastery}.</CardHint>
        </Card>
      )}
      {view.rated && <ButtonLink href="/" size="lg" block>تابع مهمة اليوم <ChevronLeft aria-hidden className="size-5" /></ButtonLink>}
    </div>
  );
}
