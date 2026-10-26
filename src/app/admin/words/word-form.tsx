"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { saveWordAction } from "@/features/admin/actions";

type Initial = {
  id?: string;
  word?: string;
  meaning?: string;
  synonyms?: string[];
  antonyms?: string[];
  example?: string;
  relationNote?: string | null;
  difficulty?: number;
  category?: string;
  active?: boolean;
};

const input = "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2";

export function WordForm({ initial = {} }: { initial?: Initial }) {
  const [state, action, pending] = useActionState(saveWordAction, null);
  return (
    <Card>
      <form action={action} className="grid gap-4 sm:grid-cols-2">
        {initial.id && <input type="hidden" name="id" value={initial.id} />}
        <label className="block">
          الكلمة
          <input
            name="word"
            required
            defaultValue={initial.word}
            className={`${input} font-display text-xl`}
          />
        </label>
        <label className="block">
          المعنى
          <input name="meaning" required defaultValue={initial.meaning} className={input} />
        </label>
        <label className="block">
          المرادفات <span className="text-muted text-xs">(افصل بـ ، أو |)</span>
          <input
            name="synonyms"
            required
            defaultValue={initial.synonyms?.join("، ")}
            className={input}
          />
        </label>
        <label className="block">
          الأضداد
          <input name="antonyms" defaultValue={initial.antonyms?.join("، ")} className={input} />
        </label>
        <label className="block sm:col-span-2">
          مثال في جملة <span className="text-muted text-xs">(يجب أن يحتوي الكلمة كما كُتبت)</span>
          <textarea
            name="example"
            required
            defaultValue={initial.example}
            rows={2}
            className={input}
          />
        </label>
        <label className="block sm:col-span-2">
          ارتباطات لفظية (اختياري)
          <textarea
            name="relationNote"
            defaultValue={initial.relationNote ?? ""}
            rows={2}
            className={input}
          />
        </label>
        <label className="block">
          الصعوبة
          <select name="difficulty" defaultValue={initial.difficulty ?? 2} className={input}>
            <option value={1}>1 — سهلة</option>
            <option value={2}>2 — متوسطة</option>
            <option value={3}>3 — متقدمة</option>
          </select>
        </label>
        <label className="block">
          التصنيف
          <input name="category" defaultValue={initial.category ?? "عام"} className={input} />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="active" defaultChecked={initial.active ?? true} /> مفعّلة
        </label>
        {state?.errors?.length ? (
          <ul
            role="alert"
            className="bg-danger-soft text-danger rounded-xl p-3 text-sm sm:col-span-2"
          >
            {state.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : null}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "جارٍ الحفظ…" : "حفظ"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
