import { asc } from "drizzle-orm";
import { BADGE_ICON_KEYS, BadgeIcon } from "@/components/app/badge-icon";
import { Button } from "@/components/ui/button";
import { Card, CardHint } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { badges } from "@/db/schema";
import { saveBadgeAction } from "@/features/admin/actions";

export const metadata = { title: "الإنجازات" };

const CRITERIA: Record<string, string> = {
  first_activity: "أول نشاط يومي",
  streak_days: "سلسلة أيام (العتبة = عدد الأيام)",
  words_learned: "كلمات متعلَّمة",
  words_mastered: "كلمات متقنة",
  comeback: "عودة بعد انقطاع (العتبة = أيام الانقطاع)",
  synonyms_mastered: "إجابات مرادفات صحيحة",
  sessions_completed: "جلسات مكتملة",
};
const input = "rounded-lg border border-border bg-surface px-2 py-1.5 text-sm";

export default async function BadgesAdmin() {
  const rows = await getDb().select().from(badges).orderBy(asc(badges.sortOrder));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">الإنجازات</h1>
      <CardHint>
        يُقيَّم كل إنجاز على الخادم بعد كل نشاط تعليمي. نوع المعيار ثابت في الكود؛ العتبة والنص
        قابلان للتعديل.
      </CardHint>
      <div className="grid gap-3">
        {rows.map((b) => (
          <Card key={b.id}>
            <form action={saveBadgeAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={b.id} />
              <BadgeIcon icon={b.icon} earned={b.enabled} />
              <label className="text-sm">
                الاسم
                <input name="name" defaultValue={b.name} className={`${input} block`} />
              </label>
              <label className="min-w-64 flex-1 text-sm">
                الوصف
                <input
                  name="description"
                  defaultValue={b.description}
                  className={`${input} block w-full`}
                />
              </label>
              <label className="text-sm">
                الأيقونة
                <select name="icon" defaultValue={b.icon} className={`${input} block`}>
                  {BADGE_ICON_KEYS.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                العتبة
                <input
                  type="number"
                  name="threshold"
                  min={1}
                  defaultValue={b.threshold}
                  className={`${input} block w-24`}
                />
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="enabled" defaultChecked={b.enabled} /> مفعّل
              </label>
              <Button size="sm" type="submit">
                حفظ
              </Button>
              <p className="text-muted w-full text-xs">
                المعيار: {CRITERIA[b.criteriaType]} · <code>{b.code}</code>
              </p>
            </form>
          </Card>
        ))}
      </div>
    </div>
  );
}
