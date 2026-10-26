"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { importCsvAction } from "@/features/admin/actions";

const SAMPLE = `word,meaning,synonyms,antonyms,example,difficulty,category
مقدام,شجاع يتقدّم ولا يتأخر,شجاع|جسور,جبان|متخاذل,كان القائد مقدام الصفوف في المعركة.,2,صفات`;

export function ImportForm() {
  const [state, action, pending] = useActionState(importCsvAction, null);
  return (
    <Card>
      <form action={action} className="space-y-3">
        <label className="block">
          ملف CSV
          <input type="file" name="file" accept=".csv,text/csv" className="mt-1 block" />
        </label>
        <label className="block">
          أو الصق المحتوى
          <textarea
            name="csv"
            rows={8}
            dir="auto"
            defaultValue={SAMPLE}
            className="border-border bg-surface mt-1 w-full rounded-lg border p-3 font-mono text-sm"
          />
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? "جارٍ الاستيراد…" : "استيراد"}
        </Button>
        {state?.message && (
          <p role="status" className={state.ok ? "text-success" : "text-danger"}>
            {state.message}
          </p>
        )}
        {state?.errors?.length ? (
          <ul className="text-danger list-disc ps-5 text-sm">
            {state.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : null}
      </form>
    </Card>
  );
}
