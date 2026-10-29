import { BookOpen, CheckCircle2, ChevronLeft, Circle, Clock, Crosshair, Flame, Sparkles, Trophy } from "lucide-react";
import Link from "next/link";
import { BadgeIcon } from "@/components/app/badge-icon";
import { NoonCta } from "@/components/app/noon-cta";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHint } from "@/components/ui/card";
import { Num, Xp } from "@/components/ui/num";
import { Pill } from "@/components/ui/pill";
import { Progress } from "@/components/ui/progress";
import { analytics } from "@/features/analytics/analytics";
import { requireUser } from "@/features/auth/dal";
import { getDashboard, type DashboardData } from "@/features/dashboard/service";
import { cn } from "@/lib/utils";

export const metadata = { title: "الرئيسية" };

export default async function DashboardPage() {
  const user = await requireUser();
  const d = await getDashboard(user);
  void analytics.track("dashboard_viewed", { missionDone: d.mission.completed }, { userId: user.id });

  return (
    <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
      <div className="grid content-start gap-4 lg:col-span-2">
        <MissionHero d={d} />
        <FocusPanel d={d} />
        <GamesGrid d={d} />
      </div>
      <aside className="grid content-start gap-4">
        <LevelCard d={d} />
        <WeeklyRankCard d={d} />
        <ChallengeCard d={d} />
        <WordTeaser d={d} />
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
  if (status === "done_today") return `${count} أيام متتالية — أنجزت يومك`;
  if (status === "at_risk") return `استمر في سلسلتك — اليوم ${ordinal(count + 1)}`;
  if (status === "broken") return "ابدأ سلسلة جديدة اليوم";
  return "ابدأ أول يوم في سلسلتك";
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
  const nextHref = next?.id === "word_of_day" ? "/word-of-the-day" : d.recommended ? `/play/${d.recommended.id}` : "/play";
  const done = d.mission.completed;
  return (
    <Card className={cn("overflow-hidden p-0", done && "border-success/30")}>
      <div
        className={cn(
          "px-5 pt-5 pb-4",
          done ? "bg-success-soft" : "bg-surface-muted",
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
          <ButtonLink href="/play" size="lg" variant="outline" block>
            جولة إضافية
          </ButtonLink>
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
  if (!d.wod.word) {
    return (
      <Card className="flex items-center gap-3">
        <span aria-hidden className="bg-surface-muted text-muted grid size-11 place-items-center rounded-xl">
          <Sparkles className="size-5" />
        </span>
        <div>
          <p className="text-muted text-sm">كلمة اليوم</p>
          <p className="text-sm">لا توجد كلمة معتمدة من بنك نون اليوم.</p>
        </div>
      </Card>
    );
  }
  return (
    <Link href="/word-of-the-day" className="group rounded-brand block focus-visible:outline-offset-4">
      <Card className="group-hover:border-primary/40 flex items-center gap-4 transition">
        <span aria-hidden className="bg-primary-soft text-primary-ink grid size-11 place-items-center rounded-xl">
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-muted text-sm">كلمة اليوم · من بنك نون</p>
          <p className="font-display text-3xl leading-tight font-bold">{d.wod.word}</p>
        </div>
        <span className="text-primary-ink text-sm font-semibold">{d.wod.completed ? "راجعها" : "ابدأ"}</span>
      </Card>
    </Link>
  );
}

/** "محتاج تركز على إيه؟" — local weak skill + the one Noon action on the screen. */
function FocusPanel({ d }: { d: DashboardData }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <span aria-hidden className="bg-primary-soft text-primary-ink grid size-10 shrink-0 place-items-center rounded-xl">
          <Crosshair className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">محتاج تركز على إيه؟</h2>
          {d.weak ? (
            <>
              <p className="mt-0.5">
                <strong className="text-danger">{d.weak.nameAr}</strong>
                <span className="text-muted"> · {d.weak.topicName}</span>
              </p>
              <Progress value={Math.round(d.weak.mastery * 100)} max={100} label="إتقانك لهذه المهارة" className="mt-2 h-2" />
              <p className="text-muted mt-1 text-xs">من إجاباتك في ألعاب لفظي (<Num value={d.weak.correct} /> من <Num value={d.weak.attempts} />) — وليست خريطة نون الرسمية.</p>
            </>
          ) : (
            <p className="text-muted mt-0.5 text-sm">العب بضع جولات لنعرف أين تحتاج التركيز. خريطة مهاراتك الرسمية موجودة في نون.</p>
          )}
        </div>
      </div>
      {d.study.length > 0 && (
        <Link href={`/study/${d.study[0].id}`} className="hover:bg-surface-muted flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
          <BookOpen aria-hidden className="text-primary-ink size-4" />
          <span className="flex-1">ذاكر: {d.study[0].title}</span>
          {d.study[0].isDevExample && <Pill tone="dev">مثال للتطوير</Pill>}
        </Link>
      )}
      <NoonCta href={d.noonHref} size="lg" label={d.weak ? "تدرّب على هذه المهارة في نون" : "تدرب على نون"} />
    </Card>
  );
}

function GamesGrid({ d }: { d: DashboardData }) {
  return (
    <section aria-labelledby="games-h" className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 id="games-h" className="font-bold">الأقسام الستة</h2>
        <Link href="/play" className="text-primary-ink text-sm font-medium">كل الألعاب</Link>
      </div>
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {d.games.map((g) => {
          const inner = (
            <Card className={cn("h-full p-4", g.playable ? "hover:border-primary/40 transition" : "opacity-75")}>
              <div className="flex items-center justify-between">
                <span aria-hidden className="font-num text-primary-ink text-lg font-bold">{g.letter}</span>
                {g.id === d.recommended?.id && <Pill tone="primary">مقترحة</Pill>}
                {!g.live && <Pill>قريبًا</Pill>}
                {g.live && !g.playable && <Pill tone="xp">بلا محتوى</Pill>}
              </div>
              <p className="mt-1 font-bold">{g.nameAr}</p>
              <p className="text-muted text-xs">{g.topicName}</p>
              {g.mastery !== null && <Progress value={Math.round(g.mastery * 100)} max={100} label={`إتقان ${g.topicName}`} className="mt-2 h-1.5" />}
            </Card>
          );
          return <li key={g.id}>{g.live ? <Link href={`/play/${g.id}`} className="rounded-brand block h-full">{inner}</Link> : inner}</li>;
        })}
      </ul>
    </section>
  );
}

function ChallengeCard({ d }: { d: DashboardData }) {
  const c = d.challenge;
  if (!c) return null;
  return (
    <Card>
      <p className="text-muted text-xs">تحدي الأسبوع</p>
      <p className="font-bold">{c.gameName} · {c.topicName}</p>
      {c.rows.length ? (
        <ol className="mt-2 space-y-1 text-sm">
          {c.rows.slice(0, 3).map((r) => (
            <li key={r.userId} className={cn("flex justify-between", r.userId === c.me?.userId && "text-primary-ink font-bold")}>
              <span><Num value={r.rank} />. {r.displayName}</span>
              <span className="font-num"><Num value={r.score} /></span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-muted mt-1 text-sm">لا أحد في الترتيب بعد — كن الأول.</p>
      )}
      {c.me && c.me.rank > 3 && <p className="text-muted mt-1 text-xs">ترتيبك <Num value={c.me.rank} /> · <Num value={c.me.score} /> نقطة</p>}
      {d.recommended && <ButtonLink href={`/play/${d.recommended.id}`} size="sm" variant="outline" className="mt-3" block>العب في التحدي</ButtonLink>}
    </Card>
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
        <p className="font-num text-primary-ink text-2xl font-bold">
          <Xp value={d.profile.xpTotal} />
        </p>
      </div>
      <Progress
        value={l.xpIntoLevel}
        max={l.next ? l.next.minXp - l.current.minXp : 1}
        label="التقدم نحو المستوى التالي"
        className="mt-3"
        barClassName="bg-primary"
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
