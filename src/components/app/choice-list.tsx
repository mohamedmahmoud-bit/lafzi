"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

const LETTERS = ["أ", "ب", "ج", "د", "هـ", "و"];

/** Official Noon options in their original order, with accessible feedback and hint removal. */
export function ChoiceList({
  choices,
  selected,
  correctId,
  removedId,
  disabled,
  onSelect,
  name,
  cols = 2,
}: {
  choices: { id: string; text: string }[];
  selected: string | null;
  correctId: string | null;
  removedId?: string | null;
  disabled?: boolean;
  onSelect: (id: string) => void;
  name: string;
  cols?: 1 | 2;
}) {
  const revealed = correctId !== null;
  return (
    <div role="radiogroup" aria-label={name} className={cn("grid gap-2.5", cols === 2 && "sm:grid-cols-2")}>
      {choices.map((o, i) => {
        const removed = removedId === o.id && !revealed;
        const isSel = selected === o.id;
        const isCorrect = revealed && o.id === correctId;
        const isWrong = revealed && isSel && o.id !== correctId;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={isSel}
            aria-disabled={removed || undefined}
            disabled={disabled || revealed || removed}
            onClick={() => onSelect(o.id)}
            className={cn(
              "border-border bg-surface flex min-h-14 items-center gap-3 rounded-xl border-2 px-4 py-3 text-start text-[1.05rem] font-medium transition",
              !revealed && !removed && "hover:border-primary/50 hover:bg-primary-soft/40",
              isSel && !revealed && "border-primary bg-primary-soft",
              isCorrect && "border-success bg-success-soft",
              isWrong && "border-danger bg-danger-soft",
              revealed && !isCorrect && !isWrong && "opacity-60",
              removed && "line-through opacity-35",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "bg-surface-muted text-muted grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold",
                isCorrect && "bg-success text-white",
                isWrong && "bg-danger text-white",
              )}
            >
              {isCorrect ? <Check className="size-4" /> : isWrong ? <X className="size-4" /> : LETTERS[i]}
            </span>
            <span className="font-display">{o.text}</span>
            {removed && <span className="sr-only">(محذوف بالتلميح)</span>}
            {isCorrect && <span className="sr-only">(الإجابة الصحيحة)</span>}
            {isWrong && <span className="sr-only">(إجابتك — غير صحيحة)</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Noon's explanation verbatim, or an honest "not available" — never generated text. */
export function NoonExplanation({ text, noonQuestionId }: { text: string | null; noonQuestionId: number | null }) {
  return (
    <div className="bg-surface-muted rounded-xl px-4 py-3 text-sm">
      <p className="text-muted mb-1 text-xs font-semibold">
        شرح نون{noonQuestionId ? <> · سؤال رقم <bdi className="font-num">{noonQuestionId}</bdi></> : null}
      </p>
      {text ? (
        <p className="leading-relaxed whitespace-pre-line">{text}</p>
      ) : (
        <p className="text-muted">لا يتوفر شرح لهذا السؤال في بنك نون.</p>
      )}
    </div>
  );
}
