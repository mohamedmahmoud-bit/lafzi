"use client";

import { Sparkles } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { memoryAttemptAction } from "@/features/games/actions";
import type { ClientRound } from "@/features/games/types";
import { cn, seededRandom, shuffle, hashString } from "@/lib/utils";

type Card = { key: string; text: string; side: "word" | "pair"; round: number; choiceId: string };

/** ذاكرة لفظي: flip two cards; a word + its pair stays open. Mistakes only lower the score. */
export function MemoryBoard({ sessionId, rounds, mistakes, onMatched, onMistake, onError }: { sessionId: string; rounds: ClientRound[]; mistakes: number; onMatched: (i: number, choiceId: string, points: number) => void; onMistake: (n: number) => void; onError: (e: string | null) => void }) {
  const cards = useMemo<Card[]>(() => {
    const all: Card[] = [
      ...rounds.map((r, i) => ({ key: `w${i}`, text: r.stem, side: "word" as const, round: i, choiceId: "" })),
      ...(rounds[0]?.choices ?? []).map((c) => ({ key: `p${c.id}`, text: c.text, side: "pair" as const, round: -1, choiceId: c.id })),
    ];
    return shuffle(all, seededRandom(hashString(sessionId)));
  }, [rounds, sessionId]);
  const matchedWords = new Set(rounds.map((r, i) => (r.answered ? i : -1)).filter((i) => i >= 0));
  const matchedPairs = new Set(rounds.filter((r) => r.answered).map((r) => r.answered!.choiceId));
  const [open, setOpen] = useState<string[]>([]);
  const [pending, start] = useTransition();

  const isOpen = (c: Card) => open.includes(c.key) || (c.side === "word" ? matchedWords.has(c.round) : matchedPairs.has(c.choiceId));

  const flip = (c: Card) => {
    if (pending || isOpen(c) || open.length >= 2) return;
    const next = [...open, c.key];
    setOpen(next);
    if (next.length < 2) return;
    const [a, b] = next.map((k) => cards.find((x) => x.key === k)!);
    const word = a.side === "word" ? a : b.side === "word" ? b : null;
    const pair = a.side === "pair" ? a : b.side === "pair" ? b : null;
    if (!word || !pair) {
      onMistake(mistakes + 1);
      setTimeout(() => setOpen([]), 700);
      return;
    }
    start(async () => {
      const res = await memoryAttemptAction({ sessionId, round: word.round, choiceId: pair.choiceId });
      if (!res.ok) {
        onError(res.error);
        setOpen([]);
        return;
      }
      onError(null);
      if (res.data.matched) {
        onMatched(word.round, pair.choiceId, res.data.points);
        setOpen([]);
      } else {
        onMistake(res.data.mistakes);
        setTimeout(() => setOpen([]), 800);
      }
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-center font-bold">{rounds[0]?.prompt}</p>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {cards.map((c) => {
          const shown = isOpen(c);
          const done = c.side === "word" ? matchedWords.has(c.round) : matchedPairs.has(c.choiceId);
          return (
            <li key={c.key} className="flip-card aspect-[4/5]" data-open={shown}>
              <button type="button" onClick={() => flip(c)} disabled={done} aria-label={shown ? c.text : "بطاقة مقلوبة"} className="flip-inner block w-full">
                <span className="flip-face bg-grape text-white grid place-items-center rounded-2xl shadow-sm">
                  <Sparkles aria-hidden className="size-6 opacity-80" />
                </span>
                <span className={cn("flip-face flip-back font-display grid place-items-center rounded-2xl border-2 p-1 text-center text-base font-bold leading-tight", done ? "border-mint bg-mint-soft" : c.side === "word" ? "border-sky bg-sky-soft" : "border-sun bg-sun-soft")}>
                  {c.text}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-muted text-center text-xs">اقلب بطاقتين: كلمة وقرينتها. القلبات الخاطئة: <span className="font-num">{mistakes}</span></p>
    </div>
  );
}
