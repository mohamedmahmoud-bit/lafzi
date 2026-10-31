import { CheckCircle2, ChevronLeft, Circle, Flame, Play, Sparkles, Swords, Trophy, UserPlus, Zap } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/app/brand-art";
import { BadgeIcon } from "@/components/app/badge-icon";
import { GameIcon } from "@/components/game/game-icon";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHint, CardTitle } from "@/components/ui/card";
import { Num, Xp } from "@/components/ui/num";
import { Progress } from "@/components/ui/progress";
import { analytics } from "@/features/analytics/analytics";
import { requireUser } from "@/features/auth/dal";
import { getDashboard, type DashboardData } from "@/features/dashboard/service";
import { startGameAction } from "@/features/games/actions";
import { cn } from "@/lib/utils";

export const metadata = { title: "الرئيسية" };

export default async function HomePage() {
  const user = await requireUser();
  const d = await getDashboard(user);
  void analytics.track("dashboard_viewed", { missionDone: d.mission.completed }, { userId: user.id });
  return (
    <div className="mx-auto grid max-w-5xl min-w-0 gap-4 lg:grid-cols-3">
      <div className="grid min-w-0 content-start gap-4 lg:col-span-2">
        <StreakHero d={d} />
        <TodayChallenge d={d} />
        <QuickPlay d={d} />
        <Categories d={d} />
      </div>
      <aside className="grid min-w-0 content-start gap-4">
        <FriendsCard d={d} />
        <WeeklyBoard d={d} />
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
        <Collection d={d} />
      </aside>
    </div>
  );
}

function StreakHero({ d }: { d: DashboardData }) {
  const { count, status } = d.streak;
  const left = Math.max(0, d.interactions.needed - d.interactions.done);
  const line =
    status === "done_today" ? "يومك محسوب — كمّل واجمع نقاط أكثر" : left > 0 && d.interactions.done > 0 ? `باقي ${left} إجابات وتحسب يومك` : status === "at_risk" ? "سلسلتك تنتظرك اليوم" : status === "broken" ? "ابدأ سلسلة جديدة اليوم — كل بداية تُحسب" : "أجب ٥ إجابات اليوم وابدأ سلسلتك";
  return (
    <Card className="bg-flame-soft border-flame/20 flex items-center gap-4">
      <span className="relative grid size-20 shrink-0 place-items-center">
        <Flame aria-hidden className={cn("text-flame size-20", status !== "broken" && count > 0 && "animate-flame")} fill="currentColor" fillOpacity={0.15} />
        <span className="font-num absolute pt-4 text-2xl font-black">{count}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-2xl font-bold">{count > 0 ? <>سلسلتك <Num value={count} /> {count === 1 ? "يوم" : "أيام"}</> : "مستعد تبدأ؟"}</p>
        <p className="text-sm">{line}</p>
        <Progress value={Math.min(d.interactions.done, d.interactions.needed)} max={d.interactions.needed} label="إجابات اليوم" className="mt-2 h-2" barClassName="bg-flame" />
        <p className="text-muted mt-1 text-xs">أفضل سلسلة: <Num value={d.longestStreak} /> · اليوم: <Xp value={d.xpToday} plus /></p>
      </div>
    </Card>
  );
}

function TodayChallenge({ d }: { d: DashboardData }) {
  const tasks = d.mission.tasks;
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold">{d.mission.completed ? "أنجزت مهمة اليوم!" : "مستعد لتحدي اليوم؟"}</h2>
        <span className="text-muted text-xs"><Num value={d.mission.doneCount} /> من <Num value={tasks.length} /></span>
      </div>
      <ol className="space-y-2">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-2 text-sm">
            {t.done ? <CheckCircle2 aria-hidden className="text-mint size-5" /> : <Circle aria-hidden className="text-border size-5" />}
            <span className={cn("font-semibold", t.done && "text-muted line-through")}>{t.title}</span>
            <span className="text-muted">— {t.detail}</span>
          </li>
        ))}
      </ol>
      <div className="grid gap-2 sm:grid-cols-2">
        {!d.wod.done && d.wod.word && (
          <ButtonLink href="/word-of-the-day" variant="outline" size="lg" block>
            <Sparkles aria-hidden className="text-sun size-5" /> كلمة اليوم: <span className="font-display">{d.wod.word}</span>
          </ButtonLink>
        )}
        {d.daily.playable && !d.daily.done && (
          d.daily.open ? (
            <ButtonLink href={`/play/session/${d.daily.open}`} size="lg" block className="bg-flame text-white"><Play aria-hidden className="size-5" /> أكمل التحدي</ButtonLink>
          ) : (
            <form action={startGameAction}>
              <input type="hidden" name="gameId" value="daily_challenge" />
              <Button size="lg" block className="bg-flame text-white"><Play aria-hidden className="size-5" /> ٣ دقائق تفصلك عن <Num value={d.daily.xp} /> نقطة</Button>
            </form>
          )
        )}
        {!d.daily.playable && <CardHint>تحدي اليوم يظهر بعد اعتماد أول دفعة من الكلمات.</CardHint>}
      </div>
    </Card>
  );
}

function QuickPlay({ d }: { d: DashboardData }) {
  const first = d.games.find((g) => g.playable);
  return (
    <section aria-labelledby="qp" className="min-w-0 space-y-2">
      <div className="flex items-center justify-between">
        <h2 id="qp" className="font-bold">العب</h2>
        <Link href="/play" className="text-primary-ink text-sm font-semibold">كل الألعاب</Link>
      </div>
      {first && (
        <form action={startGameAction}>
          <input type="hidden" name="gameId" value={first.id} />
          <Button size="lg" block className="bg-sky h-14 text-lg text-white"><Zap aria-hidden className="size-5" /> لعب سريع — {first.nameAr}</Button>
        </form>
      )}
      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {d.games.map((g) => (
          <li key={g.id} className="w-36 shrink-0">
            <Link href={`/play/${g.id}`} className={cn("bg-surface border-border block h-full rounded-2xl border p-3 transition active:scale-[0.98]", !g.playable && "opacity-60")}>
              <GameIcon icon={g.icon} gameId={g.id} />
              <p className="mt-2 font-bold">{g.nameAr}</p>
              <p className="text-muted line-clamp-2 text-xs">{g.tagline}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const CAT_TONES = ["bg-sky-soft", "bg-mint-soft", "bg-sun-soft", "bg-grape-soft", "bg-rose-soft", "bg-flame-soft"];
function Categories({ d }: { d: DashboardData }) {
  if (!d.categories.length) return null;
  return (
    <section aria-labelledby="cats" className="space-y-2">
      <h2 id="cats" className="font-bold">استكشف الأقسام</h2>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {d.categories.map((c, i) => (
          <li key={c.id}>
            <Link href={`/play/meaning_hunter?category=${c.id}`} className={cn("block rounded-2xl p-3 transition active:scale-[0.98]", CAT_TONES[i % CAT_TONES.length])}>
              <p className="font-bold">{c.nameAr}</p>
              <p className="text-muted text-xs"><Num value={c.words} /> كلمة</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FriendsCard({ d }: { d: DashboardData }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <CardTitle>أصحابك</CardTitle>
        <Link href="/friends" className="text-primary-ink text-sm font-semibold">الكل</Link>
      </div>
      {d.friends.length ? (
        <ul className="flex flex-wrap gap-3">
          {d.friends.map((f) => (
            <li key={f.userId} className="w-14 text-center">
              <Avatar avatar={f.avatar} size={48} className="mx-auto" />
              <p className="truncate text-xs">{f.name.split(" ")[0]}</p>
              {f.friendStreak > 0 && <p className="text-flame text-[0.7rem] font-bold"><Flame aria-hidden className="inline size-3" /> <Num value={f.friendStreak} /></p>}
            </li>
          ))}
        </ul>
      ) : (
        <CardHint>العب مع أصحابك: أرسل لهم رابط دعوة أو تحدٍّ.</CardHint>
      )}
      {d.challenges.length > 0 && (
        <ul className="space-y-1">
          {d.challenges.map((c) => (
            <li key={c.id}>
              <Link href={`/c/${c.code}`} className="hover:bg-surface-muted flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm">
                <Swords aria-hidden className="text-grape size-4" />
                <span className="flex-1">{c.gameName}</span>
                <span className="text-muted text-xs">{c.bothDone ? "النتيجة جاهزة" : c.players.length < 2 ? "بانتظار صاحبك" : "قيد اللعب"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <ButtonLink href="/friends" variant="outline" size="sm" block><UserPlus aria-hidden className="size-4" /> تحدَّ صاحبك</ButtonLink>
    </Card>
  );
}

function WeeklyBoard({ d }: { d: DashboardData }) {
  return (
    <Link href="/leaderboard" className="rounded-brand block">
      <Card className="hover:border-primary/40 space-y-2 transition">
        <div className="flex items-center gap-2">
          <Trophy aria-hidden className="text-sun size-5" />
          <CardTitle className="flex-1">ترتيب الأسبوع</CardTitle>
          {d.myRank && <span className="font-num text-sm font-bold">#{d.myRank}</span>}
        </div>
        <ol className="space-y-1.5">
          {d.board.map((r) => (
            <li key={r.userId} className={cn("flex items-center gap-2 text-sm", r.isMe && "text-primary-ink font-bold")}>
              <span className="font-num w-5 text-center">{r.rank}</span>
              <Avatar avatar={r.avatar} size={28} />
              <span className="flex-1 truncate">{r.isMe ? "أنت" : r.displayName}</span>
              <Xp value={r.xp} />
            </li>
          ))}
        </ol>
        {d.board.length <= 1 && <CardHint>أضف أصحابك لتتنافسوا كل أسبوع.</CardHint>}
      </Card>
    </Link>
  );
}

function Collection({ d }: { d: DashboardData }) {
  const c = d.collection;
  return (
    <Link href="/words" className="rounded-brand block">
      <Card className="hover:border-primary/40 transition">
        <div className="flex items-center justify-between">
          <CardTitle>مجموعة كلماتك</CardTitle>
          <ChevronLeft aria-hidden className="text-muted size-4" />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div className="bg-mint-soft rounded-xl py-2"><p className="font-num text-xl font-bold"><Num value={c.mastered} /></p><p className="text-muted text-[0.7rem]">متقنة</p></div>
          <div className="bg-sun-soft rounded-xl py-2"><p className="font-num text-xl font-bold"><Num value={c.learning} /></p><p className="text-muted text-[0.7rem]">قيد التعلم</p></div>
          <div className="bg-surface-muted rounded-xl py-2"><p className="font-num text-xl font-bold"><Num value={c.total} /></p><p className="text-muted text-[0.7rem]">في لفظي</p></div>
        </div>
      </Card>
    </Link>
  );
}
