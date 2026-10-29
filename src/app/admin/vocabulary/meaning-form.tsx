"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { approveMeaningAction } from "@/features/admin/content-actions";

export function MeaningForm({ entryId, sources }: { entryId: string; sources: { questionId: string; noonId: number }[] }) {
  const [s, action, pending] = useActionState(approveMeaningAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="entryId" value={entryId} />
      <select name="questionId" className="border-border bg-surface rounded-lg border px-2 py-1 text-xs" aria-label="سؤال المصدر">
        {sources.map((x) => <option key={x.questionId} value={x.questionId}>سؤال {x.noonId}</option>)}
      </select>
      <input name="quote" placeholder="انسخ المعنى حرفيًا من شرح نون" className="border-border bg-surface min-w-48 flex-1 rounded-lg border px-2 py-1 text-xs" />
      <Button size="sm" variant="ghost" disabled={pending}>اعتماد المعنى</Button>
      {s?.message && <span className={s.ok ? "text-success text-xs" : "text-danger text-xs"}>{s.message}</span>}
    </form>
  );
}
