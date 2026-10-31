import { BadgeCheck, Flame, Pencil, Star, Trophy, Zap } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/app/brand-art";
import { BadgeIcon } from "@/components/app/badge-icon";
import { Card, CardHint, CardTitle } from "@/components/ui/card";
import { Num, Xp } from "@/components/ui/num";
import { Progress } from "@/components/ui/progress";
import { requireUser } from "@/features/auth/dal";
import { listBadgesForStudent } from "@/features/badges/service";
import { getFriendsBoard } from "@/features/leaderboard/service";
import { getProfile } from "@/features/profile/service";
import { listFriends, myChallenges } from "@/features/social/service";
import { lastNDays, weekRange } from "@/lib/time";
import { cn } from "@/lib/utils";
import { PrivacyForm } from "./privacy-form";

export const metadata = { title: "ملفي" };

export default async function ProfilePage() {
  const user = await requireUser();
  const p = (await getProfile(user.id))!;
  const [badges, friends, challenges] = await Promise.all([listBadgesForStudent(user.id), listFriends(user.id), myChallenges(user.id, 5)]);
  const board = await getFriendsBoard(user.id, friends.map((f) => f.userId));
  const myRank = board.find((r) => r.isMe)?.rank ?? null;
  const calendar = lastNDays(weekRange(p.today).end, 28);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Card className="relative text-center">
        <Link href="/profile/avatar" className="group relative mx-auto block w-fit" aria-label="تغيير الصورة الرمزية">
          <Avatar avatar={p.avatar} size={112} className="ring-sun ring-4" />
          <span className="bg-surface border-border absolute end-0 bottom-0 grid size-9 place-items-center rounded-full border shadow group-hover:scale-110">
            <Pencil aria-hidden className="size-4" />
          </span>
        </Link>
        <h1 className="font-display mt-3 text-2xl font-bold">{p.officialName}</h1>
        <p className="text-muted flex items-center justify-center gap-1 text-xs"><BadgeCheck aria-hidden className="text-sky size-4" /> الاسم من حسابك في نون</p>
        <p className="mt-2 font-bold">المستوى <Num value={p.level.current.level} /> · {p.level.current.name}</p>
        <Progress value={p.level.xpIntoLevel} max={p.level.next ? p.level.next.minXp - p.level.current.minXp : 1} label="التقدم للمستوى التالي" className="mx-auto mt-2 h-2 max-w-xs" barClassName="bg-sun" />
      </Card>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { icon: Zap, label: "مجموع النقاط", value: <Xp value={p.xp} />, tone: "bg-sun-soft" },
          { icon: Flame, label: "السلسلة", value: <Num value={p.streak.count} />, tone: "bg-flame-soft" },
          { icon: Trophy, label: "أفضل سلسلة", value: <Num value={p.longestStreak} />, tone: "bg-grape-soft" },
          { icon: Star, label: "كلمات متقنة", value: <Num value={p.wordsMastered} />, tone: "bg-mint-soft" },
        ].map((t) => (
          <li key={t.label} className={cn("rounded-2xl p-3", t.tone)}>
            <t.icon aria-hidden className="size-5" />
            <p className="font-num mt-1 text-2xl font-black">{t.value}</p>
            <p className="text-muted text-xs">{t.label}</p>
          </li>
        ))}
      </ul>

      <Card>
        <CardTitle>تقويم التعلّم</CardTitle>
        <ol className="mt-2 grid grid-cols-7 gap-1.5" aria-label="أيام آخر أربعة أسابيع">
          {calendar.map((d) => (
            <li key={d} aria-label={`${d}: ${p.qualifiedDays.has(d) ? "يوم محسوب" : "بلا نشاط"}`} className={cn("grid aspect-square place-items-center rounded-lg text-[0.7rem] font-semibold", d > p.today ? "text-border" : p.qualifiedDays.has(d) ? "bg-flame text-white" : "bg-surface-muted text-muted", d === p.today && "ring-flame ring-2")}>
              {p.qualifiedDays.has(d) ? <Flame aria-hidden className="size-4" /> : Number(d.slice(8))}
            </li>
          ))}
        </ol>
        {myRank && <CardHint className="mt-2">ترتيبك بين أصدقائك هذا الأسبوع: <strong className="font-num">#{myRank}</strong></CardHint>}
      </Card>

      <Card>
        <div className="flex items-center justify-between"><CardTitle>الإنجازات</CardTitle><Link href="/achievements" className="text-primary-ink text-sm font-semibold">الكل</Link></div>
        <ul className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-6">
          {badges.map((b) => (
            <li key={b.id} className={cn("text-center", !b.earnedAt && "opacity-35 grayscale")} title={b.description}>
              <BadgeIcon icon={b.icon} className="mx-auto" />
              <p className="mt-1 line-clamp-2 text-[0.7rem] leading-tight">{b.name}</p>
            </li>
          ))}
        </ul>
      </Card>

      {challenges.length > 0 && (
        <Card>
          <CardTitle>تحديات الأصدقاء</CardTitle>
          <ul className="mt-2 space-y-1 text-sm">
            {challenges.map((c) => (
              <li key={c.id}><Link href={`/c/${c.code}`} className="hover:bg-surface-muted flex justify-between rounded-lg px-2 py-1.5"><span>{c.gameName}</span><span className="text-muted">{c.bothDone ? "انتهى" : "جارٍ"}</span></Link></li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardTitle>الخصوصية</CardTitle>
        <PrivacyForm shareScores={p.shareScores} visibility={p.profileVisibility} />
      </Card>
    </div>
  );
}
