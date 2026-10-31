"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { createChallengeAction } from "@/features/social/actions";

/** Creates a frozen challenge, shares the link, then starts the creator's own round. */
export function ChallengeButton({ gameId, name, icon }: { gameId: string; name: string; icon: ReactNode }) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const go = () =>
    start(async () => {
      const res = await createChallengeAction(gameId);
      if (!res.ok) return setErr(res.error);
      const url = `${location.origin}/c/${res.data.code}`;
      const text = `تحدّاني في «${name}» على لفظي! هل تغلبني؟`;
      if (navigator.share) await navigator.share({ title: "تحدي لفظي", text, url }).catch(() => undefined);
      else await navigator.clipboard?.writeText(`${text} ${url}`).catch(() => undefined);
      router.push(`/play/session/${res.data.sessionId}`);
    });
  return (
    <div>
      <button type="button" onClick={go} disabled={pending} className="border-border hover:border-grape flex w-full items-center gap-2 rounded-2xl border p-2 text-start font-semibold transition active:scale-[0.98] disabled:opacity-60">
        {icon}
        <span className="text-sm">{pending ? "لحظة…" : name}</span>
      </button>
      {err && <p className="text-rose mt-1 text-xs">{err}</p>}
    </div>
  );
}
