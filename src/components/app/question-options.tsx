"use client";

import { Check, X } from "lucide-react";
import type { QuestionOption } from "@/db/schema";
import { cn } from "@/lib/utils";

const LETTERS: Record<string, string> = { a: "أ", b: "ب", c: "ج", d: "د" };

/** Multiple-choice options with immediate, accessible feedback. */
export function QuestionOptions({
  options,
  selected,
  correctId,
  disabled,
  onSelect,
  name,
}: {
  options: QuestionOption[];
  selected: string | null;
  correctId: string | null;
  disabled?: boolean;
  onSelect: (id: string) => void;
  name: string;
}) {
  const revealed = correctId !== null;
  return (
    <div role="radiogroup" aria-label={name} className="grid gap-2.5 sm:grid-cols-2">
      {options.map((o) => {
        const isSel = selected === o.id;
        const isCorrect = revealed && o.id === correctId;
        const isWrong = revealed && isSel && o.id !== correctId;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={isSel}
            disabled={disabled || revealed}
            onClick={() => onSelect(o.id)}
            className={cn(
              "border-border bg-surface flex min-h-14 items-center gap-3 rounded-xl border-2 px-4 py-3 text-start text-[1.05rem] font-medium transition",
              !revealed && "hover:border-primary/50 hover:bg-primary-soft/40",
              isSel && !revealed && "border-primary bg-primary-soft",
              isCorrect && "border-success bg-success-soft",
              isWrong && "border-danger bg-danger-soft",
              revealed && !isCorrect && !isWrong && "opacity-60",
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
              {isCorrect ? (
                <Check className="size-4" />
              ) : isWrong ? (
                <X className="size-4" />
              ) : (
                LETTERS[o.id]
              )}
            </span>
            <span>{o.text}</span>
            {isCorrect && <span className="sr-only">(الإجابة الصحيحة)</span>}
            {isWrong && <span className="sr-only">(إجابتك — غير صحيحة)</span>}
          </button>
        );
      })}
    </div>
  );
}
