import { Card, CardHint, CardTitle } from "@/components/ui/card";
import { Num } from "@/components/ui/num";
import { getProductMetrics } from "@/features/analytics/metrics";

export const metadata = { title: "المؤشرات" };
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}٪`);

export default async function AdminHome() {
  const m = await getProductMetrics();
  const maxDau = Math.max(1, ...m.dau.map((d) => d.users));
  const tiles: [string, string | number, string][] = [
    [
      "العودة لنون بعد المهمة",
      pct(m.returnToNoonAfterMission),
      "أيام أُنجزت فيها المهمة وتبعها انتقال لنون في اليوم نفسه (7 أيام)",
    ],
    ["نقر بطاقة «محتاج تركز»", pct(m.noonCtaCtr), "نقرات ÷ مشاهدات (طالب-يوم، 7 أيام)"],
    ["إكمال مهمة اليوم", pct(m.missionCompletionRate), "من الطلاب النشطين (7 أيام)"],
    ["إكمال كلمة اليوم", pct(m.wodCompletionRate), "من الطلاب النشطين (7 أيام)"],
    ["الاحتفاظ D1", pct(m.d1Retention), "عادوا في اليوم التالي لأول يوم"],
    ["الاحتفاظ D7", pct(m.d7Retention), "عادوا بعد 7 أيام من أول يوم"],
    ["سلسلة 3+ أيام", m.streak3, `من ${m.students} طالب`],
    ["سلسلة 7+ أيام", m.streak7, `من ${m.students} طالب`],
    ["جلسات مكتملة", m.sessions7d, "آخر 7 أيام"],
    ["كلمات متقنة", m.wordsMastered, "إجمالي"],
    ["انتقالات إلى نون", m.noonPracticeClicks7d, "آخر 7 أيام"],
    ["طلاب نشطون اليوم", m.dauToday, "DAU"],
  ];
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">مؤشرات المنتج</h1>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(([label, value, hint], i) => (
          <li key={label}>
            <Card className={i === 0 ? "border-primary/40 bg-primary-soft/40 h-full" : "h-full"}>
              <p className="text-muted text-sm">{label}</p>
              <p className="text-3xl font-bold">
                <bdi>{value}</bdi>
              </p>
              <CardHint className="text-xs">{hint}</CardHint>
            </Card>
          </li>
        ))}
      </ul>
      <Card>
        <CardTitle>الطلاب النشطون يوميًا (14 يومًا)</CardTitle>
        <div className="mt-4 flex h-36 items-end gap-1.5" aria-hidden>
          {m.dau.map((d) => (
            <div
              key={d.day}
              title={`${d.day}: ${d.users}`}
              className="bg-primary flex-1 rounded-t-[4px]"
              style={{ height: `${(d.users / maxDau) * 100}%` }}
            />
          ))}
        </div>
        <table className="sr-only">
          <caption>الطلاب النشطون يوميًا</caption>
          <tbody>
            {m.dau.map((d) => (
              <tr key={d.day}>
                <th scope="row">{d.day}</th>
                <td>{d.users}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <CardHint className="mt-2">
          من <Num value={m.dau.length} /> يومًا بها نشاط. البيانات تشمل بيانات البذر التجريبية في
          بيئة التطوير.
        </CardHint>
      </Card>
      <CardHint>
        «العودة لنون» تقيس النقر على روابط نون فقط. لقياس التدريب الفعلي داخل نون نحتاج إشارة من نون
        (Webhook أو API) — انظر docs/ARCHITECTURE.md §7.
      </CardHint>
    </div>
  );
}
