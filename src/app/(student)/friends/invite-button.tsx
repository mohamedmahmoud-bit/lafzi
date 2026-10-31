"use client";

import { Copy, Share2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { createInviteAction } from "@/features/social/actions";

export function InviteButton() {
  const [link, setLink] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const make = () =>
    start(async () => {
      const res = await createInviteAction();
      if (!res.ok) return setMsg(res.error);
      const url = `${location.origin}/f/${res.data}`;
      setLink(url);
      const text = "تعال نلعب لفظي ونتحدى بعض في الكلمات!";
      if (navigator.share) await navigator.share({ title: "لفظي", text, url }).catch(() => undefined);
      else {
        await navigator.clipboard?.writeText(url).catch(() => undefined);
        setMsg("نُسخ الرابط");
      }
    });
  return (
    <div className="space-y-2">
      <Button size="lg" block onClick={make} disabled={pending} className="bg-grape text-white">
        <Share2 aria-hidden className="size-5" /> {pending ? "لحظة…" : "ادعُ صاحبك برابط"}
      </Button>
      {link && (
        <button type="button" onClick={() => navigator.clipboard?.writeText(link).then(() => setMsg("نُسخ الرابط"))} className="bg-surface-muted flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs" dir="ltr">
          <Copy aria-hidden className="size-4 shrink-0" /> <span className="truncate">{link}</span>
        </button>
      )}
      {msg && <p className="text-mint text-center text-sm">{msg}</p>}
      <p className="text-muted text-center text-xs">الرابط صالح ٧ أيام. لا توجد رسائل خاصة — الأصدقاء يتنافسون فقط.</p>
    </div>
  );
}
