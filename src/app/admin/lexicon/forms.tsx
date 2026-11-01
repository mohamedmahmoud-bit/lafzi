"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { acceptCleanBatchAction, approveBankWordAction, importDatasetAction, mergeEntriesAction, refreshBankWordsAction, setLemmaAction, type ActionState } from "@/features/admin/content-actions";

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

/** Edit a word's tashkeel (letters must stay the same). */
export function LemmaForm({ id, lemma }: { id: string; lemma: string }) {
  const [s, action, pending] = useActionState(setLemmaAction, null);
  return (
    <form action={action} className="flex items-center gap-1">
      <input type="hidden" name="id" value={id} />
      <input name="lemma" defaultValue={lemma} aria-label="التشكيل" className="border-border bg-surface font-display w-36 rounded-lg border px-2 py-1 text-lg" />
      <Button size="sm" variant="ghost" disabled={pending}>حفظ التشكيل</Button>
      {s?.message && <span className={s.ok ? "text-mint text-xs" : "text-rose text-xs"}>{s.message}</span>}
    </form>
  );
}

export function RefreshBankWordsButton() {
  const [s, action, pending] = useActionState<ActionState, FormData>(() => refreshBankWordsAction(), null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" disabled={pending}>{pending ? "جارٍ الفحص…" : "استخراج الكلمات من البنك"}</Button>
      {s?.message && <span className={s.ok ? "text-mint text-xs" : "text-rose text-xs"}>{s.message}</span>}
    </form>
  );
}

/** Reviewer writes the meaning (and may fix the word to its dictionary form) before approving. */
export function BankWordForm({ id, lemma, categories }: { id: string; lemma: string; categories: { id: string; nameAr: string }[] }) {
  const [s, action, pending] = useActionState(approveBankWordAction, null);
  if (s?.ok) return <p className="text-mint text-sm">{s.message}</p>;
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-[9rem_1fr_1fr_9rem_auto] sm:items-center">
      <input type="hidden" name="id" value={id} />
      <input name="lemma" defaultValue={lemma} aria-label="الكلمة (صيغتها الأصلية مع التشكيل)" className="border-border bg-surface font-display rounded-lg border px-2 py-1 text-lg" />
      <input name="meaning" required placeholder="المعنى (تكتبه أنت)" className="border-border bg-surface rounded-lg border px-2 py-1 text-sm" />
      <input name="example" placeholder="مثال (اختياري)" className="border-border bg-surface rounded-lg border px-2 py-1 text-sm" />
      <select name="categoryId" defaultValue="vo_qudurat" className="border-border bg-surface rounded-lg border px-2 py-1 text-sm" aria-label="القسم">
        {categories.map((c) => <option key={c.id} value={c.id}>{c.nameAr}</option>)}
      </select>
      <Button size="sm" variant="success" disabled={pending}>اعتماد</Button>
      {s?.message && !s.ok && <span className="text-rose text-xs sm:col-span-5">{s.message}</span>}
    </form>
  );
}
