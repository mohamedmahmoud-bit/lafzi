import { Flame, MoreHorizontal, Swords } from "lucide-react";
import { Avatar } from "@/components/app/brand-art";
import { GameIcon } from "@/components/game/game-icon";
import { Card, CardHint, CardTitle } from "@/components/ui/card";
import { Num } from "@/components/ui/num";
import { requireUser } from "@/features/auth/dal";
import { CHALLENGE_GAMES, gameById } from "@/features/games/modes";
import { blockUserAction, removeFriendAction, reportUserAction } from "@/features/social/actions";
import { listFriends, myChallenges } from "@/features/social/service";
import { ChallengeButton } from "./challenge-button";
import { InviteButton } from "./invite-button";

export const metadata = { title: "الأصدقاء" };

export default async function FriendsPage({ searchParams }: { searchParams: Promise<{ added?: string; reported?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [friends, challenges] = await Promise.all([listFriends(user.id), myChallenges(user.id, 10)]);
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="font-display text-3xl font-bold">الأصدقاء</h1>
      {sp.added && <p className="bg-mint-soft rounded-xl px-4 py-3 text-sm font-semibold">أصبحتما صديقين! تحدَّه الآن.</p>}
      {sp.reported && <p className="bg-sun-soft rounded-xl px-4 py-3 text-sm">وصلنا البلاغ وسيراجعه فريق لفظي. شكرًا.</p>}

      <Card className="space-y-3">
        <CardTitle>تحدَّ صاحبك</CardTitle>
        <CardHint>العب جولة، ثم أرسل الرابط. صاحبك يلعب نفس الأسئلة بنفس القواعد، وتظهر النتيجة حين ينتهي الاثنان.</CardHint>
        <div className="grid grid-cols-2 gap-2">
          {CHALLENGE_GAMES.map((id) => {
            const g = gameById(id)!;
            return <ChallengeButton key={id} gameId={id} name={g.nameAr} icon={<GameIcon icon={g.icon} gameId={id} className="size-9" />} />;
          })}
        </div>
      </Card>

      <Card><InviteButton /></Card>

      <Card>
        <CardTitle>أصحابك (<Num value={friends.length} />)</CardTitle>
        {friends.length === 0 ? (
          <CardHint className="mt-2">لا يوجد أصدقاء بعد. ادعُ زميلك برابط أو أرسل له تحديًا.</CardHint>
        ) : (
          <ul className="divide-border mt-2 divide-y">
            {friends.map((f) => (
              <li key={f.userId} className="flex items-center gap-3 py-2.5">
                <Avatar avatar={f.avatar} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{f.name}</p>
                  <p className="text-muted text-xs">المستوى <Num value={f.level} /> · سلسلته <Num value={f.streak} /></p>
                </div>
                {f.friendStreak > 0 && (
                  <span className="bg-flame-soft text-flame flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold" title="أيام لعبتما فيها معًا">
                    <Flame aria-hidden className="size-3.5" /> <Num value={f.friendStreak} />
                  </span>
                )}
                <details className="relative">
                  <summary className="hover:bg-surface-muted grid size-9 cursor-pointer list-none place-items-center rounded-full" aria-label="خيارات">
                    <MoreHorizontal aria-hidden className="size-5" />
                  </summary>
                  <div className="bg-surface border-border absolute end-0 z-10 mt-1 w-48 space-y-1 rounded-xl border p-2 shadow-lg">
                    <form action={removeFriendAction}><input type="hidden" name="userId" value={f.userId} /><button className="hover:bg-surface-muted w-full rounded-lg px-2 py-1.5 text-start text-sm">إزالة من الأصدقاء</button></form>
                    <form action={blockUserAction}><input type="hidden" name="userId" value={f.userId} /><button className="hover:bg-surface-muted text-rose w-full rounded-lg px-2 py-1.5 text-start text-sm">حظر</button></form>
                    <form action={reportUserAction} className="space-y-1 border-t border-border pt-1">
                      <input type="hidden" name="userId" value={f.userId} />
                      <select name="reason" className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs" aria-label="سبب البلاغ">
                        <option value="inappropriate">محتوى غير لائق</option>
                        <option value="bullying">تنمر</option>
                        <option value="cheating">غش</option>
                        <option value="other">أخرى</option>
                      </select>
                      <button className="hover:bg-surface-muted w-full rounded-lg px-2 py-1.5 text-start text-sm">إبلاغ</button>
                    </form>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {challenges.length > 0 && (
        <Card>
          <CardTitle>تحدياتك</CardTitle>
          <ul className="mt-2 space-y-1">
            {challenges.map((c) => (
              <li key={c.id}>
                <a href={`/c/${c.code}`} className="hover:bg-surface-muted flex items-center gap-2 rounded-xl px-2 py-2 text-sm">
                  <Swords aria-hidden className="text-grape size-4" />
                  <span className="flex-1 font-semibold">{c.gameName}</span>
                  <span className="text-muted text-xs">{c.players.map((p) => (p.isMe ? "أنت" : p.name.split(" ")[0])).join(" × ")}</span>
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
