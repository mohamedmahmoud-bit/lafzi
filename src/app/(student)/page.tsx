import { CheckCircle2, ChevronLeft, Circle, Clock, Flame, Sparkles, Trophy } from "lucide-react";
import Link from "next/link";
import { BadgeIcon } from "@/components/app/badge-icon";
import { FocusCard } from "@/components/app/focus-card";
import { MasteryBar } from "@/components/app/mastery-bar";
import { NoonCta } from "@/components/app/noon-cta";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHint, CardTitle } from "@/components/ui/card";
import { Num, Xp } from "@/components/ui/num";
import { Progress } from "@/components/ui/progress";
import { analytics } from "@/features/analytics/analytics";
import { requireUser } from "@/features/auth/dal";
import { getDashboard, type DashboardData } from "@/features/dashboard/service";
import { noonGoHref } from "@/features/noon-integration/urls";
import { cn } from "@/lib/utils";

export const metadata = { title: "الرئيسية" };

export default async function DashboardPage() {
  const user = await requireUser();
  const d = await getDashboard(user);
  void analytics.track(
    "dashboard_viewed",
    { missionDone: d.mission.completed },
    { userId: user.id },
  );

  return (
    <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
      <div className="grid gap-4 lg:col-span-2">
        <MissionHero d={d} />
        <FocusCard
          summary={d.noon.summary}
          focus={d.noon.focus}
          ctaHref={noonGoHref("dashboard_focus", d.noon.focus?.skillId)}
          heatmapHref={noonGoHref("dashboard_heatmap")}
          src="dashboard"
        />
        <WordTeaser d={d} />
      </div>
      <aside className="grid content-start gap-4">
        <LevelCard d={d} />
        <WeeklyRankCard d={d} />
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>حصيلتك من الكلمات</CardTitle>
            <Link href="/words" className="text-primary text-sm font-medium">
              بنك الكلمات
            </Link>
          </div>
          <p className="text-muted mt-2 text-sm">
            تعلّمت{" "}
            <strong className="text-foreground">
              <Num value={d.profile.wordsLearned} />
            </strong>{" "}
            كلمة، وأتقنت{" "}
            <strong className="text-foreground">
              <Num value={d.profile.masteredWords} />
            </strong>
          </p>
          <MasteryBar counts={d.mastery.counts} total={d.mastery.total} className="mt-3" />
        </Card>
        {d.badge && (
          <Card className="flex items-center gap-3">
            <BadgeIcon icon={d.badge.icon} />
            <div>
              <p className="text-muted text-xs">آخر إنجاز</p>
              <p className="font-bold">{d.badge.name}</p>
              <p className="text-muted text-sm">{d.badge.description}</p>
            </div>
          </Card>
        )}
      </aside>
    </div>
  );
}

function streakHeadline(d: DashboardData) {
  const { count, status } = d.streak;
  if (status === "done_today") return `🔥 ${count} أيام متتالية — أنجزت يومك`;
  if (status === "at_risk") return `🔥 استمر في سلسلتك — اليوم ${ordinal(count + 1)}`;
  if (status === "broken") return "ابدأ سلسلة جديدة اليوم 🔥";
  return "ابدأ أول يوم في سلسلتك 🔥";
}

const ORDINALS = [
  "الأول",
  "الثاني",
  "الثالث",
  "الرابع",
  "الخامس",
  "السادس",
  "السابع",
  "الثامن",
  "التاسع",
  "العاشر",
];
function ordinal(n: number) {
  return ORDINALS[n - 1] ?? `رقم ${n}`;
}

function MissionHero({ d }: { d: DashboardData }) {
  const next = d.mission.tasks.find((t) => !t.done);
  const nextHref = next?.id === "word_of_day" ? "/word-of-the-day" : "/practice";
  const done = d.mission.completed;
  return (
    <Card className={cn("overflow-hidden p-0", done && "border-success/30")}>
      <div
        className={cn(
          "px-5 pt-5 pb-4",
          done ? "bg-success-soft" : "from-primary-soft to-surface bg-gradient-to-l",
        )}
      >
        <p className="text-streak flex items-center gap-1.5 text-sm font-semibold">
          <Flame aria-hidden className="size-4" />
          {streakHeadline(d)}
        </p>
        <h1 className="mt-1 text-2xl font-bold">
          {done ? "أحسنت! أنجزت مهمة اليوم" : "مهمة اليوم"}
        </h1>
        {!done ? (
          <p className="text-muted mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="flex items-center gap-1">
              <Clock aria-hidden className="size-4" /> <Num value={d.mission.minutes.min} />–
              <Num value={d.mission.minutes.max} /> دقائق
            </span>
            <span className="text-xp font-semibold">
              حتى <Xp value={d.mission.missionXp} plus />
            </span>
          </p>
        ) : (
          <p className="text-muted mt-1 text-sm">
            ربحت اليوم{" "}
            <strong className="text-xp">
              <Xp value={d.xpToday} plus />
            </strong>
            . الخطوة الأهم الآن: درّب مهارتك الأضعف في نون.
          </p>
        )}
      </div>
      <ol className="divide-border divide-y px-5">
        {d.mission.tasks.map((t, i) => (
          <li key={t.id} className="flex items-center gap-3 py-3">
            {t.done ? (
              <CheckCircle2 aria-hidden className="text-success size-6 shrink-0" />
            ) : (
              <Circle aria-hidden className="text-border size-6 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className={cn("font-semibold", t.done && "text-muted line-through decoration-1")}>
                <span className="sr-only">{t.done ? "مكتملة: " : `الخطوة ${i + 1}: `}</span>
                {t.title}
              </p>
              <p className="text-muted text-sm">{t.detail}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="px-5 pt-1 pb-5">
        {done ? (
          <NoonCta
            href={noonGoHref("mission_done", d.noon.focus?.skillId)}
            size="lg"
            label="تدرب الآن على نون"
          />
        ) : (
          <ButtonLink href={nextHref} size="lg" block>
            {d.mission.doneCount === 0 ? "ابدأ المهمة" : `أكمل: ${next?.title}`}
            <ChevronLeft aria-hidden className="size-5" />
          </ButtonLink>
        )}
      </div>
    </Card>
  );
}

function WordTeaser({ d }: { d: DashboardData }) {
  return (
    <Link
      href="/word-of-the-day"
      className="group rounded-brand block focus-visible:outline-offset-4"
    >
      <Card className="group-hover:border-primary/40 flex items-center gap-4 transition">
        <span
          aria-hidden
          className="bg-primary-soft text-primary grid size-11 place-items-center rounded-xl"
        >
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-muted text-sm">كلمة اليوم</p>
          <p className="font-display text-3xl leading-tight font-bold">{d.wod.word}</p>
          <p className="text-muted text-sm">
            {d.wod.meaning ?? "هل تستطيع استنتاج معناها من السياق؟"}
          </p>
        </div>
        <span className="text-primary text-sm font-semibold">
          {d.wod.completed ? "راجعها" : d.wod.guessed ? "أكمل" : "خمّن"}
        </span>
      </Card>
    </Link>
  );
}

function LevelCard({ d }: { d: DashboardData }) {
  const l = d.level;
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted text-xs">
            المستوى <Num value={l.current.level} />
          </p>
          <p className="text-lg font-bold">{l.current.name}</p>
        </div>
        <p className="text-xp text-xl font-bold">
          <Xp value={d.profile.xpTotal} />
        </p>
      </div>
      <Progress
        value={l.xpIntoLevel}
        max={l.next ? l.next.minXp - l.current.minXp : 1}
        label="التقدم نحو المستوى التالي"
        className="mt-3"
        barClassName="bg-xp"
      />
      <CardHint className="mt-2">
        {l.next ? (
          <>
            باقي <Xp value={l.xpForNext ?? 0} /> لتصبح «{l.next.name}»
          </>
        ) : (
          "وصلت لأعلى مستوى — سيد الكلمات!"
        )}
      </CardHint>
    </Card>
  );
}

function WeeklyRankCard({ d }: { d: DashboardData }) {
  const lb = d.leaderboard;
  return (
    <Link href="/leaderboard" className="rounded-brand block">
      <Card className="hover:border-primary/40 flex items-center gap-3 transition">
        <span aria-hidden className="bg-xp-soft text-xp grid size-11 place-items-center rounded-xl">
          <Trophy className="size-5" />
        </span>
        <div className="flex-1">
          <p className="text-muted text-xs">ترتيبك هذا الأسبوع</p>
          {lb.rank ? (
            <p className="font-bold">
              <Num value={lb.rank} /> من <Num value={lb.size} /> · <Xp value={lb.weekXp} />
            </p>
          ) : (
            <p className="font-bold">انضم إلى الترتيب بإكمال مهمتك</p>
          )}
          {lb.xpToNext ? (
            <p className="text-muted text-xs">
              <Xp value={lb.xpToNext} plus /> وتتقدّم مركزًا
            </p>
          ) : null}
        </div>
      </Card>
    </Link>
  );
}
