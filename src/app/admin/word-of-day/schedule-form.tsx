"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { scheduleWodAction } from "@/features/admin/actions";

export function ScheduleForm({ minDay }: { minDay: string }) {
  const [state, action, pending] = useActionState(scheduleWodAction, null);
  return (
    <Card>
      <form action={action} className="flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          اليوم
          <input
            type="date"
            name="day"
            min={minDay}
            defaultValue={minDay}
            required
            className="border-border bg-surface mt-1 block rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          الكلمة
          <input
            name="word"
            required
            placeholder="مثال: جسور"
            className="border-border bg-surface font-display mt-1 block rounded-lg border px-3 py-2"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="force" /> تجاوز منع التكرار
        </label>
        <Button type="submit" disabled={pending}>
          جدولة
        </Button>
        {state?.message && (
          <p
            role="status"
            className={`w-full text-sm ${state.ok ? "text-success" : "text-danger"}`}
          >
            {state.message}
          </p>
        )}
      </form>
    </Card>
  );
}
