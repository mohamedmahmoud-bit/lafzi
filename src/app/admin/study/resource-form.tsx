"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { saveResourceAction } from "@/features/admin/content-actions";

const input = "rounded-lg border border-border bg-surface px-2 py-1.5 text-sm";

export function ResourceForm({ topics, subskills, types }: { topics: { id: string; nameAr: string }[]; subskills: { id: string; nameAr: string; topicId: string }[]; types: [string, string][] }) {
  const [s, action, pending] = useActionState(saveResourceAction, null);
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-2">
      <input name="title" required placeholder="العنوان" className={`${input} sm:col-span-2`} />
      <textarea name="description" placeholder="وصف قصير" className={`${input} sm:col-span-2`} rows={2} />
      <select name="resourceType" className={input} aria-label="النوع">{types.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <select name="status" className={input} aria-label="الحالة"><option value="draft">مسودة</option><option value="published">منشور</option></select>
      <select name="topicId" className={input} aria-label="القسم">{topics.map((t) => <option key={t.id} value={t.id}>{t.nameAr}</option>)}</select>
      <select name="subskillId" className={input} aria-label="المهارة"><option value="">— القسم كله —</option>{subskills.map((x) => <option key={x.id} value={x.id}>{x.nameAr}</option>)}</select>
      <input name="locator" placeholder="https://… (رابط الملف المعتمد من نون)" dir="ltr" className={`${input} sm:col-span-2`} />
      <Button size="sm" disabled={pending} className="sm:col-span-2">حفظ</Button>
      {s?.message && <p className={`${s.ok ? "text-success" : "text-danger"} text-xs sm:col-span-2`}>{s.message}</p>}
    </form>
  );
}
