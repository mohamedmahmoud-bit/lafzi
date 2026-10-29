"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  addDestinationAction,
  recordVerificationAction,
  saveMappingAction,
  type ActionState,
} from "@/features/admin/content-actions";

const input = "rounded-lg border border-border bg-surface px-2 py-1.5 text-sm";

function Status({ s }: { s: ActionState }) {
  return s?.message ? <p className={s.ok ? "text-success text-xs" : "text-danger text-xs"} dir="auto">{s.message}</p> : null;
}

export function MappingForm(p: { topicId: string; subskillId: string | null; current: { noonChapterId: number | null; noonTopicId: number | null; noonSubtopicId: number | null; noonConceptId: number | null; noonLabel: string | null } }) {
  const [s, action, pending] = useActionState(saveMappingAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="topicId" value={p.topicId} />
      {p.subskillId && <input type="hidden" name="subskillId" value={p.subskillId} />}
      {(["noonChapterId", "noonTopicId", "noonSubtopicId", "noonConceptId"] as const).map((k) => (
        <input key={k} name={k} defaultValue={p.current[k] ?? ""} placeholder={k.replace("noon", "").replace("Id", "")} inputMode="numeric" className={`${input} w-24 font-num`} aria-label={k} />
      ))}
      <input name="noonLabel" defaultValue={p.current.noonLabel ?? ""} placeholder="اسمها في نون" className={`${input} w-40`} />
      <Button size="sm" variant="outline" disabled={pending}>حفظ</Button>
      <Status s={s} />
    </form>
  );
}

export function DestinationForm({ mappings }: { mappings: { id: string; label: string }[] }) {
  const [s, action, pending] = useActionState(addDestinationAction, null);
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-2">
      <select name="kind" className={input} aria-label="النوع">
        <option value="skill_practice">تدريب مهارة</option>
        <option value="heatmap">خريطة المهارات</option>
        <option value="general_practice">تدريب عام</option>
      </select>
      <select name="platform" className={input} aria-label="المنصة">
        <option value="web">ويب (كمبيوتر)</option>
        <option value="mobile_web">متصفح الجوال</option>
        <option value="app">تطبيق نون</option>
        <option value="any">الكل</option>
      </select>
      <select name="mappingId" className={`${input} sm:col-span-2`} aria-label="الربط">
        <option value="">— بلا ربط (للخريطة/التدريب العام) —</option>
        {mappings.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select>
      <input name="url" required placeholder="https://student.noonacademy.com/…" dir="ltr" className={`${input} sm:col-span-2`} />
      <label className="text-xs">ينتهي في (اختياري)<input type="datetime-local" name="expiresAt" className={`${input} block w-full`} /></label>
      <input name="notes" placeholder="ملاحظات / مصدر الرابط" className={input} />
      <Button size="sm" disabled={pending} className="sm:col-span-2">إضافة وجهة (غير متحقق منها)</Button>
      <div className="sm:col-span-2"><Status s={s} /></div>
    </form>
  );
}

export function VerifyForm({ destinationId, scenarios }: { destinationId: string; scenarios: [string, string][] }) {
  const [s, action, pending] = useActionState(recordVerificationAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="destinationId" value={destinationId} />
      <select name="scenario" className={input} aria-label="السيناريو">
        {scenarios.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <select name="result" className={input} aria-label="النتيجة">
        <option value="pass">نجح</option>
        <option value="partial">جزئي</option>
        <option value="fail">فشل</option>
      </select>
      <input name="observedLanding" required placeholder="أين وصلت فعلًا؟" className={`${input} min-w-48 flex-1`} />
      <Button size="sm" variant="outline" disabled={pending}>تسجيل</Button>
      <Status s={s} />
    </form>
  );
}
