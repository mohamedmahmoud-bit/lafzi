"use client";

import { ChevronLeft, HelpCircle, PenLine, Repeat } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChoiceList } from "@/components/app/choice-list";
import { RewardPanel } from "@/components/app/reward-panel";
import { Confetti } from "@/components/game/feedback";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHint } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { WordMedia } from "@/components/word-media";
import type { RewardSummary } from "@/features/gamification/rewards";
import { answerVocabWodAction } from "@/features/word-bank/actions";
import type { VocabWodView } from "@/features/word-bank/wod.service";

type Ready = Extract<VocabWodView, { status: "ready" }>;
const DONT_KNOW = "dont_know";

/**
 * Word of the Day: recall the meaning → pick it (graded on the server, or «لا أعرف») → the card opens
 * with meanings, related words and media → say a sentence with it.
 */
export function VocabWodFlow({ initial, categoryNames }: { initial: Ready; categoryNames: Record<string, string> }) {
  const [view, setView] = useState<Ready>(initial);
  const [reward, setReward] = useState<RewardSummary | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const answer = (choiceId: string) =>
    start(async () => {
      setSelected(choiceId);
      const res = await answerVocabWodAction(choiceId);
      if (!res.ok) return setError(res.error);
      const { view: next, ...r } = res.data;
      if (next.status === "ready") setView(next);
      setReward(r);
      router.refresh();
    });

  const a = view.answered;
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Card className="relative overflow-hidden text-center">
        {a?.isCorrect && <Confetti />}
        <Pill tone="primary">كلمة اليوم</Pill>
        <p className="font-display mt-3 text-6xl leading-snug font-bold">{view.word}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-1">
          {view.categories.map((c) => <Pill key={c}>{categoryNames[c] ?? c}</Pill>)}
        </div>
        {!a && <p className="text-muted mt-4">فكّر أولًا: ما معناها؟ ثم اختر.</p>}
      </Card>

      {error && <p role="alert" className="bg-rose-soft text-rose rounded-xl px-4 py-3 text-sm">{error}</p>}

      {view.choices.length > 0 && (
        <Card className="space-y-3">
          <p className="text-muted text-center text-sm font-semibold">ما معنى «{view.word}»؟</p>
          <ChoiceList
            name={`معنى ${view.word}`}
            choices={view.choices}
            selected={a ? a.choiceId : selected}
            correctId={a ? a.correctId : null}
            disabled={pending || !!a}
            onSelect={answer}
            cols={view.choices.some((c) => c.text.length > 18) ? 1 : 2}
          />
          {!a && (
            <Button variant="ghost" size="sm" block onClick={() => answer(DONT_KNOW)} disabled={pending}>
              <HelpCircle aria-hidden className="size-4" /> لا أعرف — أرني المعنى
            </Button>
          )}
          {a && (
            <p className={a.isCorrect ? "text-mint text-center text-lg font-bold" : "text-rose text-center text-lg font-bold"}>
              {a.isCorrect ? "صح! أحسنت" : a.choiceId === DONT_KNOW ? "لا بأس — تعرّف عليها الآن" : "ليست هذه — الإجابة الصحيحة مظللة"}
            </p>
          )}
        </Card>
      )}

      {a && view.card && (
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
      )}

      {reward && <RewardPanel reward={reward} />}

      {a && view.card && (
        <Card className="space-y-2">
          <div className="border-border flex items-start gap-2 rounded-xl border border-dashed px-3 py-2 text-sm">
            <PenLine aria-hidden className="text-primary-ink mt-0.5 size-4 shrink-0" />
            <p>قل جملة من عندك فيها «{view.word}» — الآن، بصوت مسموع.</p>
          </div>
          <CardHint className="flex items-center gap-1"><Repeat aria-hidden className="size-4" /> {a.isCorrect ? "ممتاز — ستعود لك بعد فترة لتثبيتها." : "ستعود لك قريبًا للمراجعة."} حالتها: {view.card.mastery}.</CardHint>
        </Card>
      )}
      {a && <ButtonLink href="/play" size="lg" block>العب جولة <ChevronLeft aria-hidden className="size-5" /></ButtonLink>}
    </div>
  );
}
