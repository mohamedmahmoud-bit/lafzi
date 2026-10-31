"use client";

import { useState, useTransition } from "react";
import { updateProfileAction } from "@/features/profile/actions";

export function PrivacyForm({ shareScores, visibility }: { shareScores: boolean; visibility: string }) {
  const [share, setShare] = useState(shareScores);
  const [vis, setVis] = useState(visibility);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = (patch: { shareScores?: boolean; profileVisibility?: "friends" | "private" }) =>
    start(async () => {
      const res = await updateProfileAction(patch);
      setMsg(res.ok ? "تم الحفظ" : res.error);
    });
  return (
    <div className="mt-2 space-y-3 text-sm">
      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-1 size-5" checked={share} disabled={pending} onChange={(e) => { setShare(e.target.checked); save({ shareScores: e.target.checked }); }} />
        <span><strong>أظهر نتيجتي في ترتيب الدفعة</strong><span className="text-muted block">مغلق افتراضيًا. أصدقاؤك يرون نتيجتك دائمًا.</span></span>
      </label>
      <label className="flex items-center justify-between gap-3">
        <span><strong>من يرى ملفي</strong></span>
        <select value={vis} disabled={pending} onChange={(e) => { setVis(e.target.value); save({ profileVisibility: e.target.value as "friends" | "private" }); }} className="rounded-lg border border-border bg-surface px-2 py-1.5">
          <option value="friends">أصدقائي</option>
          <option value="private">أنا فقط</option>
        </select>
      </label>
      {msg && <p className="text-mint">{msg}</p>}
    </div>
  );
}
