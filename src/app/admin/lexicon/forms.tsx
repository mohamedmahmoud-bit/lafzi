"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { acceptCleanBatchAction, importDatasetAction, mergeEntriesAction } from "@/features/admin/content-actions";

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

/** Approves clean rows in batches of 40 until none are left (safe to stop and resume). */
export function AcceptCleanButton({ count }: { count: number }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();
  const run = async () => {
    setBusy(true);
    setMsg(null);
    let total = 0;
    try {
      for (let guard = 0; guard < 100; guard++) {
        const res = await acceptCleanBatchAction();
        if (!res.ok) throw new Error(res.error);
        total += res.accepted;
        setDone(total);
        if (res.remaining === 0 || res.accepted === 0) break;
      }
      setMsg({ ok: true, text: `اعتُمد ${total} سجلًا.` });
    } catch (e) {
      setMsg({ ok: false, text: `توقف بعد ${total}: ${(e as Error).message}. اضغط مرة أخرى للمتابعة.` });
    } finally {
      setBusy(false);
      router.refresh();
    }
  };
  return (
    <div className="space-y-2">
      <Button variant="success" size="sm" onClick={run} disabled={busy || count === 0}>
        {busy ? `جارٍ الاعتماد… ${done}` : `اعتماد كل السليم (${count})`}
      </Button>
      {msg && <p className={msg.ok ? "text-mint text-sm" : "text-rose text-sm"}>{msg.text}</p>}
    </div>
  );
}
