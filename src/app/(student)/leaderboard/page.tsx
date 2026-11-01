import { CalendarClock, Lock, Trophy } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/app/brand-art";
import { Card, CardHint } from "@/components/ui/card";
import { Num, Xp } from "@/components/ui/num";
import { analytics } from "@/features/analytics/analytics";
import { requireUser } from "@/features/auth/dal";
import { getTaxonomy } from "@/features/curriculum/service";
import { getCategoryBoard, getCohortBoard, getFriendsBoard, type BoardPeriod, type BoardRow } from "@/features/leaderboard/service";
import { listFriends } from "@/features/social/service";
import { learningDay, weekRange } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata = { title: "الترتيب" };
const TABS = [
  { id: "cohort", label: "الجميع" },
  { id: "friends", label: "الأصدقاء" },
  { id: "category", label: "الأقسام" },
] as const;
const PERIODS: { id: BoardPeriod; label: string }[] = [
  { id: "all", label: "الترتيب العام" },
  { id: "week", label: "هذا الأسبوع" },
  { id: "day", label: "اليوم" },
];

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ tab?: string; category?: string; period?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.id === sp.tab)?.id ?? "cohort";
  const period: BoardPeriod = tab === "category" ? "week" : (PERIODS.find((p) => p.id === sp.period)?.id ?? "all");
  const friends = await listFriends(user.id);
  const friendIds = friends.map((f) => f.userId);
  const tax = await getTaxonomy();
  const cats = tax.subskillsOf("vocabulary");
  const category = cats.find((c) => c.id === sp.category)?.id ?? cats[0]?.id;
  const today = learningDay();
  const wk = weekRange(today);
  const daysLeft = Math.max(0, Math.round((Date.parse(wk.end) - Date.parse(today)) / 86_400_000));
  void analytics.track("leaderboard_viewed", { tab, period }, { userId: user.id });

  let rows: BoardRow[] = [];
  let note: React.ReactNode = null;
  let unit: "xp" | "pts" = "xp";
  if (tab === "friends") {
    rows = await getFriendsBoard(user.id, friendIds, period);
    if (!friends.length) note = <>أضف أصحابك من <Link href="/friends" className="text-primary-ink font-semibold">صفحة الأصدقاء</Link> لتتنافسوا.</>;
  } else if (tab === "cohort") {
    const c = await getCohortBoard(user, friendIds, period);
    rows = c.rows;
    note = c.authorized ? (
      <>يمكنك إخفاء نتيجتك من ترتيب الجميع من ملفك.</>
    ) : (
      <span className="flex items-start gap-1.5"><Lock aria-hidden className="mt-0.5 size-4 shrink-0" /> لحماية خصوصية الطلاب تظهر أسماء أصدقائك فقط. ترتيبك بين <Num value={c.size} /> طالبًا اختاروا المشاركة: {c.me ? <strong className="font-num">#{c.me.rank}</strong> : "—"}</span>
    );
  } else if (category) {
    rows = await getCategoryBoard(user.id, friendIds, category);
    unit = "pts";
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <header>
        <h1 className="font-display text-3xl font-bold">الترتيب</h1>
        <p className="text-muted flex items-center gap-1.5 text-sm">
          <CalendarClock aria-hidden className="size-4" />
          {period === "all" ? (
            "مجموع النقاط منذ البداية"
          ) : period === "day" ? (
            "نقاط اليوم — يبدأ من جديد كل يوم"
          ) : (
            <>{daysLeft > 0 ? <>ينتهي بعد <Num value={daysLeft} /> {daysLeft > 2 ? "أيام" : "يوم"}</> : "اليوم آخر أيام الأسبوع"} · يبدأ الجميع من الصفر كل أحد</>
          )}
        </p>
      </header>
      <nav className="bg-surface-muted flex gap-1 rounded-2xl p-1" aria-label="نطاق الترتيب">
        {TABS.map((t) => (
          <Link key={t.id} href={`/leaderboard?tab=${t.id}`} aria-current={t.id === tab ? "page" : undefined} className={cn("flex-1 rounded-xl py-2 text-center text-sm font-bold", t.id === tab ? "bg-surface shadow-sm" : "text-muted")}>
            {t.label}
          </Link>
        ))}
      </nav>
      {tab !== "category" && (
        <nav className="flex gap-2" aria-label="فترة الترتيب">
          {PERIODS.map((p) => (
            <Link key={p.id} href={`/leaderboard?tab=${tab}&period=${p.id}`} aria-current={p.id === period ? "page" : undefined} className={cn("rounded-full border px-3 py-1 text-sm", p.id === period ? "border-sky bg-sky-soft font-bold" : "border-border text-muted")}>
              {p.label}
            </Link>
          ))}
        </nav>
      )}
      {tab === "category" && <CardHint>ترتيب الأقسام يحسب نقاط هذا الأسبوع.</CardHint>}
      {tab === "category" && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {cats.map((c) => (
            <Link key={c.id} href={`/leaderboard?tab=category&category=${c.id}`} className={cn("shrink-0 rounded-full border px-3 py-1 text-sm", c.id === category ? "border-sky bg-sky-soft font-bold" : "border-border")}>
              {c.nameAr}
            </Link>
          ))}
        </div>
      )}
      <Card className="p-2">
        {rows.length === 0 ? (
          <CardHint className="p-4 text-center">{period === "all" ? "لا نتائج بعد" : period === "day" ? "لا نتائج اليوم بعد" : "لا نتائج هذا الأسبوع بعد"} — العب جولة وكن أول من يظهر هنا.</CardHint>
        ) : (
          <ol className="space-y-1">
            {rows.map((r) => (
              <li key={r.userId} className={cn("flex items-center gap-3 rounded-xl px-3 py-2", r.isMe && "bg-sun-soft")}>
                <span className={cn("font-num w-7 text-center text-lg font-black", r.rank === 1 && "text-sun")}>{r.rank === 1 ? <Trophy aria-label="الأول" className="mx-auto size-5" /> : r.rank}</span>
                <Avatar avatar={r.avatar} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{r.displayName}{r.isMe && <span className="text-muted text-xs"> (أنت)</span>}</p>
                  <p className="text-muted text-xs">المستوى <Num value={r.level} /></p>
                </div>
                <span className="font-num font-bold">{unit === "xp" ? <Xp value={r.xp} /> : <><Num value={r.xp} /> نقطة</>}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
      {note && <CardHint>{note}</CardHint>}

    </div>
  );
}
