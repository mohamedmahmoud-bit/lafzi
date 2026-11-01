"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { importQuestionsAction } from "@/features/admin/content-actions";

export function ImportQuestionsForm() {
  const [s, action, pending] = useActionState(importQuestionsAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="file" name="file" accept=".md,.markdown,.csv,.txt" className="text-sm" />
      <Button size="sm" disabled={pending}>{pending ? "جارٍ الاستيراد…" : "استيراد الأسئلة"}</Button>
      {s?.message && <p className={s.ok ? "text-mint w-full text-sm" : "text-rose w-full text-sm"}>{s.message}</p>}
    </form>
  );
}
