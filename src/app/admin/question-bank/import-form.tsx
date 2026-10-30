"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { beginImportAction, finishImportAction, importBatchAction, publishAllReadyAction, type ActionState } from "@/features/admin/content-actions";

type Dto = { id: number; curriculum?: { chapterId?: number | null }[] };
const BATCH = 50;

async function readExport(file: File): Promise<Dto[]> {
  const stream = file.name.endsWith(".gz") ? file.stream().pipeThrough(new DecompressionStream("gzip")) : file.stream();
  const json = JSON.parse(await new Response(stream).text());
  const data = Array.isArray(json) ? json : json.data;
  if (!Array.isArray(data)) throw new Error(`${file.name}: لا يحتوي على قائمة أسئلة`);
  return data;
}

/** Upload an authorised Noon export (.json or .json.gz) — processed in batches through the normal pipeline. */
export function ImportForm() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (form: FormData) => {
    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) return;
    setBusy(true);
    setMsg(null);
    setDone(0);
    try {
      const items = (await Promise.all(files.map(readExport))).flat();
      const unique = [...new Map(items.map((q) => [q.id, q])).values()];
      const chapters = [...new Set(unique.flatMap((q) => (q.curriculum ?? []).map((c) => Number(c.chapterId)).filter(Boolean)))];
      setTotal(unique.length);
      const runId = await beginImportAction({ chapters, total: unique.length, fileNames: files.map((f) => f.name) });
      for (let i = 0; i < unique.length; i += BATCH) {
        await importBatchAction(runId, unique.slice(i, i + BATCH));
        setDone(Math.min(unique.length, i + BATCH));
      }
      const res = await finishImportAction(runId, { chapters, seenIds: unique.map((q) => q.id), complete: form.get("complete") === "on" });
      const s = res.stats as Record<string, number>;
      setMsg({ ok: res.status === "succeeded", text: `${res.status}: جديد ${s.new ?? 0} · معدّل ${s.modified ?? 0} · بلا تغيير ${s.unchanged ?? 0} · جاهز ${s.ready ?? 0} · للمراجعة ${s.reviewRequired ?? 0} · مرفوض ${s.rejected ?? 0} · مؤرشف ${s.removed ?? 0}` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form action={run} className="space-y-3">
      <input type="file" name="files" accept=".json,.gz,application/json,application/gzip" multiple className="block text-sm" disabled={busy} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="complete" defaultChecked /> الملف يحتوي كل أسئلة هذه الفصول (أرشف ما ليس فيه)
      </label>
      <Button type="submit" size="sm" disabled={busy}>{busy ? "جارٍ الاستيراد…" : "استيراد"}</Button>
      {total > 0 && <Progress value={done} max={total} label="تقدم الاستيراد" className="h-2" />}
      {total > 0 && <p className="text-muted text-xs font-num">{done} / {total}</p>}
      {msg && <p className={msg.ok ? "text-success text-sm" : "text-danger text-sm"}>{msg.text}</p>}
    </form>
  );
}

export function PublishReadyButton({ ready }: { ready: number }) {
  const [s, action, pending] = useActionState<ActionState, FormData>(() => publishAllReadyAction(), null);
  return (
    <form action={action} className="space-y-2">
      <Button type="submit" variant="success" size="sm" disabled={pending || ready === 0}>
        {pending ? "جارٍ النشر…" : `نشر كل الجاهز (${ready})`}
      </Button>
      {s?.message && <p className={s.ok ? "text-success text-xs" : "text-danger text-xs"}>{s.message}</p>}
    </form>
  );
}
