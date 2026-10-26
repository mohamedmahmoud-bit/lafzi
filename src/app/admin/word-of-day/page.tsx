import { Card, CardHint } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { clearWodAction } from "@/features/admin/actions";
import { getWodSchedule } from "@/features/admin/service";
import { WOD_NO_REPEAT_DAYS } from "@/features/daily-word/service";
import { addDays, learningDay } from "@/lib/time";
import { ScheduleForm } from "./schedule-form";

export const metadata = { title: "كلمة اليوم" };

export default async function WodAdminPage() {
  const today = learningDay();
  const schedule = await getWodSchedule(today);
  const byDay = new Map(schedule.map((s) => [s.day, s]));
  const days = Array.from({ length: 22 }, (_, i) => addDays(today, i - 7));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">جدولة كلمة اليوم</h1>
      <CardHint>
        الأيام غير المجدولة تُختار تلقائيًا عند أول زيارة، دون تكرار أي كلمة خلال{" "}
        {WOD_NO_REPEAT_DAYS} يومًا. اليوم يبدأ عند منتصف الليل بتوقيت الرياض.
      </CardHint>
      <ScheduleForm minDay={addDays(today, 1)} />
      <Card className="p-0">
        <ul className="divide-border divide-y">
          {days.map((d) => {
            const s = byDay.get(d);
            return (
              <li
                key={d}
                className={`flex items-center gap-3 px-4 py-2.5 ${d === today ? "bg-primary-soft/50" : ""}`}
              >
                <span className="w-28 text-sm tabular-nums" dir="ltr">
                  {d}
                </span>
                {d === today && <Pill tone="primary">اليوم</Pill>}
                <span className="font-display flex-1 text-lg font-bold">
                  {s?.word ?? (
                    <span className="text-muted font-sans text-sm font-normal">
                      {d < today ? "—" : "تلقائي"}
                    </span>
                  )}
                </span>
                {s && (
                  <Pill tone={s.source === "manual" ? "xp" : "neutral"}>
                    {s.source === "manual" ? "يدوي" : "تلقائي"}
                  </Pill>
                )}
                {s && d > today && (
                  <form action={clearWodAction}>
                    <input type="hidden" name="day" value={d} />
                    <button className="text-danger text-sm">إزالة</button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
