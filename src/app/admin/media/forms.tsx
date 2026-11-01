"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { addMediaAction, importMediaAction } from "@/features/admin/content-actions";

const field = "border-border bg-surface rounded-lg border px-2 py-1 text-sm";

export function ImportMediaForm() {
  const [s, action, pending] = useActionState(importMediaAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="file" name="file" accept=".csv,text/csv" className="text-sm" />
      <Button size="sm" disabled={pending}>{pending ? "جارٍ الاستيراد…" : "استيراد للمراجعة"}</Button>
      {s?.message && <p className={s.ok ? "text-mint w-full text-sm" : "text-rose w-full text-sm"}>{s.message}</p>}
    </form>
  );
}

export function AddMediaForm() {
  const [s, action, pending] = useActionState(addMediaAction, null);
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-2">
      <input name="word" required placeholder="الكلمة (منشورة في القاموس)" className={field} />
      <select name="kind" defaultValue="youtube" className={field} aria-label="النوع">
        <option value="youtube">مقطع يوتيوب</option>
        <option value="image">صورة (رابط)</option>
        <option value="audio">صوت (رابط)</option>
      </select>
      <input name="url" required dir="ltr" placeholder="https://…" className={`${field} sm:col-span-2`} />
      <input name="start" dir="ltr" placeholder="من (مثال 0:12) — ليوتيوب" className={field} />
      <input name="end" dir="ltr" placeholder="إلى (مثال 0:18) — ليوتيوب" className={field} />
      <input name="credit" placeholder="المصدر / الترخيص (يظهر للطالب)" className={`${field} sm:col-span-2`} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="approve" defaultChecked /> اعتمِد الآن (راجعته بنفسي)</label>
      <Button size="sm" disabled={pending}>{pending ? "جارٍ الإضافة…" : "إضافة"}</Button>
      {s?.message && <p className={s.ok ? "text-mint text-sm sm:col-span-2" : "text-rose text-sm sm:col-span-2"}>{s.message}</p>}
    </form>
  );
}
