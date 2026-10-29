import { CalendarClock, Trophy } from "lucide-react";
import { Card, CardHint } from "@/components/ui/card";
import { Num, Xp } from "@/components/ui/num";
import { Pill } from "@/components/ui/pill";
import { Avatar } from "@/components/app/brand-art";
import { analytics } from "@/features/analytics/analytics";
import { requireUser } from "@/features/auth/dal";
import { visibleWindow, type RankedRow } from "@/features/leaderboard/ranking";
import { getWeeklyLeaderboard } from "@/features/leaderboard/service";
import { cn } from "@/lib/utils";

export const metadata = { title: "الترتيب" };

export default async function LeaderboardPage() {
  const user = await requireUser();
  const lb = await getWeeklyLeaderboard(user);
  void analytics.track("leaderboard_viewed", { rank: lb.me?.rank ?? null }, { userId: user.id });
  const { head, tail } = visibleWindow(lb.rows, user.id);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <p className="text-secondary text-sm font-semibold">الترتيب</p>
        <h1 className="text-2xl font-bold">هذا الأسبوع</h1>
        <p className="text-muted flex items-center gap-1.5 text-sm">
          <CalendarClock aria-hidden className="size-4" />
          {lb.week.daysLeft > 0 ? (
            <>
              ينتهي الأسبوع بعد <Num value={lb.week.daysLeft} />{" "}
              {lb.week.daysLeft > 2 ? "أيام" : "يوم"}
            </>
          ) : (
            "اليوم آخر أيام الأسبوع"
          )}
          {" · "}يبدأ الجميع من الصفر كل أحد
        </p>
      </header>

      {lb.me ? (
        <Card className="bg-primary-soft/50 flex items-center gap-4">
          <span
            aria-hidden
            className="bg-primary text-primary-foreground font-num grid size-12 place-items-center rounded-2xl text-xl font-bold"
          >
            <Num value={lb.me.rank} />
          </span>
          <div className="flex-1">
            <p className="font-bold">
              مركزك <Num value={lb.me.rank} /> من <Num value={lb.rows.length} />
            </p>
            <p className="text-muted text-sm">
              {lb.xpToNext ? (
                <>
                  تحتاج <Xp value={lb.xpToNext} plus /> لتتقدّم مركزًا — مهمة اليوم تكفي!
                </>
              ) : lb.me.rank === 1 ? (
                "أنت في الصدارة — حافظ عليها"
              ) : (
                "واصل التعلّم لتتقدّم"
              )}
            </p>
          </div>
          <p className="text-xp text-xl font-bold">
            <Xp value={lb.me.xp} />
          </p>
        </Card>
      ) : (
        <Card>
          <CardHint>
            لم تنضم إلى مجموعة ترتيب بعد. سيظهر ترتيبك عند ربط صفك أو برنامجك في نون.
          </CardHint>
        </Card>
      )}

      {lb.rows.length > 0 && (
        <Card className="p-0">
          <ol aria-label="ترتيب المجموعة هذا الأسبوع" className="divide-border divide-y">
            {head.map((r) => (
              <Row key={r.userId} r={r} me={r.userId === user.id} />
            ))}
            {tail.length > 0 && (
              <>
                <li aria-hidden className="text-muted py-1 text-center">
                  ⋯
                </li>
                {tail.map((r) => (
                  <Row key={r.userId} r={r} me={r.userId === user.id} />
                ))}
              </>
            )}
          </ol>
        </Card>
      )}

      {lb.lastWeek && (
        <Card className="flex items-center gap-3">
          <Trophy aria-hidden className="text-xp size-5" />
          <p className="text-sm">
            الأسبوع الماضي: المركز <Num value={lb.lastWeek.rank} /> من{" "}
            <Num value={lb.lastWeek.size} /> بـ <Xp value={lb.lastWeek.xp} />
          </p>
        </Card>
      )}
      <p className="text-muted text-center text-xs">
        يُعرض الاسم الأول والصورة الرمزية فقط حفاظًا على خصوصية الطلاب.
      </p>
    </div>
  );
}

function Row({ r, me }: { r: RankedRow; me: boolean }) {
  return (
    <li
      className={cn("flex items-center gap-3 px-4 py-3", me && "bg-primary-soft/60")}
      aria-current={me ? "true" : undefined}
    >
      <span
        className={cn(
          "font-num grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold",
          r.rank === 1 ? "bg-primary text-primary-foreground" : r.rank <= 3 ? "bg-oak text-foreground" : "text-muted",
        )}
      >
        <Num value={r.rank} />
      </span>
      <Avatar avatar={r.avatar} size={36} />
      <span className={cn("flex-1 font-medium", me && "font-bold")}>
        {r.displayName} {me && <Pill tone="primary">أنت</Pill>}
      </span>
      <span className="font-bold tabular-nums">
        <Xp value={r.xp} />
      </span>
    </li>
  );
}
