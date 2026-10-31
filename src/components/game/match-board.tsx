"use client";

import { Check } from "lucide-react";
import { useState, useTransition } from "react";
import { answerRoundAction } from "@/features/games/actions";
import type { ClientRound } from "@/features/games/types";
import { cn } from "@/lib/utils";

/** وصلها صح: tap a word, then its pair. Each word gets one try; the server grades every link. */
export function MatchBoard({ sessionId, rounds, onUpdate, onError }: { sessionId: string; rounds: ClientRound[]; onUpdate: (i: number, r: ClientRound["answered"]) => void; onError: (e: string | null) => void }) {
  const [left, setLeft] = useState<number | null>(rounds.findIndex((r) => !r.answered));
  const [shake, setShake] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const rights = rounds[0]?.choices ?? [];
  const usedRights = new Set(rounds.filter((r) => r.answered?.isCorrect).map((r) => r.answered!.choiceId));
  const prompt = rounds[0]?.prompt;

  const pick = (choiceId: string) => {
    if (left === null || rounds[left].answered) return;
    const i = left;
    start(async () => {
      const res = await answerRoundAction({ sessionId, round: i, choiceId });
      if (!res.ok) return onError(res.error);
      onError(null);
      onUpdate(i, { choiceId, isCorrect: res.data.isCorrect, correctId: res.data.correctId, explanation: res.data.explanation, points: res.data.points, hintUsed: false });
      if (!res.data.isCorrect) {
        setShake(choiceId);
        setTimeout(() => setShake(null), 400);
      }
      const next = rounds.findIndex((r, j) => j !== i && !r.answered);
      setLeft(next === -1 ? null : next);
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-center font-bold">{prompt}</p>
      <div className="grid grid-cols-2 gap-3">
        <ul className="space-y-2" aria-label="الكلمات">
          {rounds.map((r, i) => {
            const a = r.answered;
            return (
              <li key={r.index}>
                <button
                  type="button"
                  disabled={!!a || pending}
                  onClick={() => setLeft(i)}
                  aria-pressed={left === i}
                  className={cn(
                    "font-display flex min-h-14 w-full items-center justify-between gap-2 rounded-2xl border-2 px-3 py-2 text-start text-lg font-bold transition",
                    !a && left === i && "border-sky bg-sky-soft scale-[1.02]",
                    !a && left !== i && "border-border bg-surface",
                    a?.isCorrect && "border-mint bg-mint-soft",
                    a && !a.isCorrect && "border-rose bg-rose-soft",
                  )}
                >
                  <span>{r.stem}</span>
                  {a && <span className="text-xs font-semibold">{a.isCorrect ? <Check aria-label="صحيح" className="text-mint size-5" /> : `← ${rights.find((x) => x.id === a.correctId)?.text}`}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <ul className="space-y-2" aria-label="الأزواج">
          {rights.map((c) => {
            const used = usedRights.has(c.id);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  disabled={used || pending || left === null}
                  onClick={() => pick(c.id)}
                  className={cn(
                    "font-display min-h-14 w-full rounded-2xl border-2 px-3 py-2 text-lg font-bold transition",
                    used ? "border-mint/40 bg-mint-soft/60 text-muted" : "border-border bg-surface hover:border-sky",
                    shake === c.id && "animate-shake border-rose",
                  )}
                >
                  {c.text}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="text-muted text-center text-xs">اختر كلمة ثم قرينتها. لكل كلمة محاولة واحدة.</p>
    </div>
  );
}
