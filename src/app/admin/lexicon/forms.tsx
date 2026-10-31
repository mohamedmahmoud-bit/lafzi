"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { importDatasetAction, mergeEntriesAction } from "@/features/admin/content-actions";

export function ImportDatasetForm() {
  const [s, action, pending] = useActionState(importDatasetAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="file" name="file" accept=".md,.markdown,.csv,.txt,text/markdown,text/csv" className="text-sm" />
      <Button size="sm" disabled={pending}>{pending ? "جارٍ الاستيراد…" : "استيراد إلى المراجعة"}</Button>
      {s?.message && <p className={s.ok ? "text-mint w-full text-sm" : "text-rose w-full text-sm"}>{s.message}</p>}
    </form>
  );
}

export function MergeForm({ sourceId }: { sourceId: string }) {
  const [s, action, pending] = useActionState(mergeEntriesAction, null);
  return (
    <form action={action} className="flex items-center gap-1">
      <input type="hidden" name="sourceId" value={sourceId} />
      <input name="target" placeholder="ادمج في…" className="border-border bg-surface w-28 rounded-lg border px-2 py-1 text-xs" />
      <Button size="sm" variant="ghost" disabled={pending}>دمج</Button>
      {s?.message && <span className={s.ok ? "text-mint text-xs" : "text-rose text-xs"}>{s.message}</span>}
    </form>
  );
}
