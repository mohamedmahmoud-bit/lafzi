"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { syncNowAction, type ActionState } from "@/features/admin/content-actions";

export function SyncButton({ disabledReason }: { disabledReason: string | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(() => syncNowAction(), null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={pending || !!disabledReason}>{pending ? "جارٍ المزامنة…" : "مزامنة الآن"}</Button>
      {disabledReason && <span className="text-danger text-sm">{disabledReason}</span>}
      {state?.message && <span className={state.ok ? "text-success text-sm" : "text-danger text-sm"}>{state.message}</span>}
    </form>
  );
}
