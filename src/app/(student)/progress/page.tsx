import { BookCheck, CalendarCheck, Flame, Layers, Star, Zap } from "lucide-react";
import Link from "next/link";
import { MasteryBar } from "@/components/app/mastery-bar";
import { Card, CardHint, CardTitle } from "@/components/ui/card";
import { Num, Xp } from "@/components/ui/num";
import { Progress } from "@/components/ui/progress";
import { analytics } from "@/features/analytics/analytics";
import { requireUser } from "@/features/auth/dal";
import { getProgress, type ProgressData } from "@/features/progress/service";
import { cn } from "@/lib/utils";

export const metadata = { title: "تقدمي" };

const WEEKDAYS = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
const weekdayName = (day: string) => WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()];

export default async function ProgressPage() {
  const user = await requireUser();
  const p = await getProgress(user.id);
  void analytics.track("progress_viewed", {}, { userId: user.id });

  const tiles = [
    { icon: BookCheck, label: "كلمات تعلّمتها", value: p.wordsLearned },
    { icon: Star, label: "كلمات أتقنتها", value: p.masteredWords },
    { icon: Flame, label: "السلسلة الحالية", value: p.streak.count, suffix: "يوم" },
    { icon: Flame, label: "أطول سلسلة", value: p.longestStreak, suffix: "يوم" },
    { icon: Zap, label: "XP هذا الأسبوع", value: p.weekXp },
    { icon: CalendarCheck, label: "أيام التعلّم", value: p.learningDays },
    { icon: Layers, label: "جولات مكتملة", value: p.sessions },
  ];

  return (
    <div className="space-y-4">
      <header>
        <p className="text-secondary text-sm font-semibold">تقدمي</p>
        <h1 className="text-2xl font-bold">أنت تتحسّن كل يوم</h1>
      </header>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-muted text-xs">
              المستوى <Num value={p.level.current.level} />
            </p>
            <p className="text-lg font-bold">{p.level.current.name}</p>
          </div>
          <p className="font-num text-primary-ink text-2xl font-bold">
            <Xp value={p.xpTotal} />
          </p>
        </div>
        <Progress
          value={p.level.xpIntoLevel}
          max={p.level.next ? p.level.next.minXp - p.level.current.minXp : 1}
          label="التقدم نحو المستوى التالي"
          className="mt-3"
          barClassName="bg-primary"
        />
        <CardHint className="mt-2">
          {p.level.next ? (
            <>
              باقي <Xp value={p.level.xpForNext ?? 0} /> للوصول إلى «{p.level.next.name}»
            </>
          ) : (
            "أعلى مستوى!"
          )}
        </CardHint>
      </Card>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {tiles.map((t) => (
          <li key={t.label}>
            <Card className="h-full p-4">
              <t.icon aria-hidden className="text-primary-ink size-5" />
              <p className="mt-2 text-2xl font-bold">
                <Num value={t.value} className="font-num tabular-nums" />
                {t.suffix && (
                  <span className="text-muted ms-1 text-sm font-medium">{t.suffix}</span>
                )}
              </p>
              <p className="text-muted text-xs">{t.label}</p>
            </Card>
          </li>
        ))}
      </ul>

      <div className="grid gap-4 lg:grid-cols-2">
        <WeekChart data={p.last7} />
        <StreakCalendar data={p.calendar} today={p.today} />
      </div>

      <SkillMap local={p.local} />

      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>إتقان المفردات</CardTitle>
          <Link href="/words" className="text-primary-ink text-sm font-medium">
            بنك الكلمات
          </Link>
        </div>
        <CardHint>
          كلمات مستخرجة من أسئلة بنك نون ومعتمدة. تنتقل الكلمة من «جديدة» إلى «متقنة» كلما تذكّرتها على فترات متباعدة.
        </CardHint>
        <MasteryBar counts={p.mastery.counts} total={p.mastery.total} className="mt-4" />
      </Card>
    </div>
  );
}

/** Single-series bar chart: XP per day, last 7 learning days. */
function WeekChart({ data }: { data: ProgressData["last7"] }) {
  const max = Math.max(60, ...data.map((d) => d.xp));
  return (
    <Card>
      <CardTitle>XP آخر 7 أيام</CardTitle>
      <div className="mt-4 flex h-40 items-end gap-2" aria-hidden>
        {data.map((d) => (
          <div
            key={d.day}
            className="group relative flex h-full flex-1 flex-col items-center justify-end gap-1"
          >
            <span className="text-muted text-xs font-semibold opacity-0 transition group-hover:opacity-100">
              {d.xp}
            </span>
            <div
              className={cn(
                "w-full max-w-9 rounded-t-[4px]",
                d.xp > 0 ? "bg-primary" : "bg-surface-muted",
              )}
              style={{ height: `${Math.max(3, (d.xp / max) * 100)}%` }}
              title={`${weekdayName(d.day)}: ${d.xp} XP`}
            />
          </div>
        ))}
      </div>
      <div className="border-border mt-1 flex gap-2 border-t pt-1" aria-hidden>
        {data.map((d) => (
          <span key={d.day} className="text-muted flex-1 text-center text-[0.7rem]">
            {weekdayName(d.day)}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>XP لكل يوم خلال آخر 7 أيام</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}>
              <th scope="row">
                {weekdayName(d.day)} {d.day}
              </th>
              <td>{d.xp} XP</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function StreakCalendar({ data, today }: { data: ProgressData["calendar"]; today: string }) {
  return (
    <Card>
      <CardTitle>تقويم السلسلة</CardTitle>
      <div
        className="text-muted mt-3 grid grid-cols-7 gap-1.5 text-center text-[0.7rem]"
        aria-hidden
      >
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <ol className="mt-1 grid grid-cols-7 gap-1.5" aria-label="أيام التعلّم في آخر خمسة أسابيع">
        {data.map((d) => (
          <li
            key={d.day}
            aria-label={`${d.day}: ${d.future ? "لم يأتِ بعد" : d.qualified ? (d.mission ? "أنجزت المهمة" : "يوم تعلّم") : "لا نشاط"}`}
            className={cn(
              "grid aspect-square place-items-center rounded-lg text-xs font-semibold",
              d.future && "text-border bg-transparent",
              !d.future && !d.qualified && "bg-surface-muted text-muted",
              d.qualified && !d.mission && "bg-streak-soft text-streak",
              d.mission && "bg-streak text-white",
              d.day === today && "ring-primary ring-offset-surface ring-2 ring-offset-2",
            )}
          >
            {d.qualified ? <Flame aria-hidden className="size-4" /> : Number(d.day.slice(8))}
          </li>
        ))}
      </ol>
      <ul className="text-muted mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="bg-streak size-3 rounded" /> أنجز المهمة كاملة
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="bg-streak-soft size-3 rounded" /> يوم تعلّم
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="bg-surface-muted size-3 rounded" /> بلا نشاط
        </li>
      </ul>
    </Card>
  );
}

/** Local performance per subskill — explicitly NOT Noon's official heat map. */
function SkillMap({ local }: { local: ProgressData["local"] }) {
  return (
    <Card>
      <CardTitle>مهاراتك في لفظي</CardTitle>
      <CardHint>من إجاباتك في ألعاب لفظي فقط — خريطة نون الرسمية لمهاراتك موجودة في منصة نون.</CardHint>
      {local.skills.length === 0 ? (
        <p className="text-muted mt-3 text-sm">العب جولة واحدة لتظهر مهاراتك هنا.</p>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {local.skills.map((s) => (
            <li key={s.subskillId}>
              <div className="flex justify-between gap-2 text-sm">
                <span className="font-semibold">{s.nameAr}</span>
                <span className="text-muted text-xs">{s.topicName} · <Num value={s.correct} /> من <Num value={s.attempts} /></span>
              </div>
              <Progress value={Math.round(s.mastery * 100)} max={100} label={`إتقان ${s.nameAr}`} className="mt-1 h-2" />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
