import { asc } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Card, CardHint, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { levels, xpRules } from "@/db/schema";
import { saveLevelAction, saveXpRuleAction } from "@/features/admin/actions";

export const metadata = { title: "النقاط والمستويات" };
const input = "rounded-lg border border-border bg-surface px-2 py-1.5 text-sm";

export default async function XpRulesAdmin() {
  const db = getDb();
  const [rules, lvls] = [
    await db.select().from(xpRules).orderBy(asc(xpRules.action)),
    await db.select().from(levels).orderBy(asc(levels.level)),
  ];
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">النقاط والمستويات</h1>
      <Card>
        <CardTitle>قواعد XP</CardTitle>
        <CardHint>
          كل منحة XP لها مفتاح فريد في السجل (لا تتكرر)، والحد اليومي يمنع الاستغلال. الحد الفارغ =
          بلا حد يومي.
        </CardHint>
        <div className="divide-border mt-3 divide-y">
          {rules.map((r) => (
            <form
              key={r.action}
              action={saveXpRuleAction}
              className="flex flex-wrap items-end gap-3 py-3"
            >
              <input type="hidden" name="action" value={r.action} />
              <div className="min-w-56 flex-1">
                <p className="font-semibold">{r.description}</p>
                <code className="text-muted text-xs">{r.action}</code>
              </div>
              <label className="text-sm">
                XP
                <input
                  type="number"
                  name="xp"
                  min={0}
                  defaultValue={r.xp}
                  className={`${input} block w-20`}
                />
              </label>
              <label className="text-sm">
                حد يومي
                <input
                  type="number"
                  name="dailyCap"
                  min={0}
                  defaultValue={r.dailyCap ?? ""}
                  className={`${input} block w-24`}
                />
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="enabled" defaultChecked={r.enabled} /> مفعّلة
              </label>
              <Button size="sm" type="submit">
                حفظ
              </Button>
            </form>
          ))}
        </div>
      </Card>
      <Card>
        <CardTitle>المستويات</CardTitle>
        <div className="divide-border mt-3 divide-y">
          {lvls.map((l) => (
            <form
              key={l.level}
              action={saveLevelAction}
              className="flex flex-wrap items-end gap-3 py-3"
            >
              <input type="hidden" name="level" value={l.level} />
              <span className="w-16 font-bold">مستوى {l.level}</span>
              <label className="text-sm">
                الاسم
                <input name="name" defaultValue={l.name} className={`${input} block`} />
              </label>
              <label className="text-sm">
                يبدأ من XP
                <input
                  type="number"
                  name="minXp"
                  min={0}
                  defaultValue={l.minXp}
                  readOnly={l.level === 1}
                  className={`${input} block w-28`}
                />
              </label>
              <Button size="sm" type="submit">
                حفظ
              </Button>
            </form>
          ))}
        </div>
      </Card>
    </div>
  );
}
