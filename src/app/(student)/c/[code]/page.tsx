import { Crown, Swords } from "lucide-react";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/app/brand-art";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHint } from "@/components/ui/card";
import { Num } from "@/components/ui/num";
import { requireUser } from "@/features/auth/dal";
import { joinChallengeAction } from "@/features/social/actions";
import { challengeView } from "@/features/social/service";
import { cn } from "@/lib/utils";

export const metadata = { title: "تحدي صاحب" };
const ERR: Record<string, string> = { expired: "انتهى هذا التحدي.", blocked: "لا يمكن قبول هذا التحدي.", invalid_link: "الرابط غير صحيح.", self: "هذا تحدّيك أنت — أرسل الرابط لصاحبك." };

export default async function ChallengePage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const { code } = await params;
  const { error } = await searchParams;
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(code)) notFound();
  const c = await challengeView(user.id, code);
  if (!c) notFound();
  const me = c.players.find((p) => p.isMe);
  const other = c.players.find((p) => !p.isMe);
  const winner = c.bothDone ? [...c.players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0] : null;
  const tie = c.bothDone && c.players[0].score === c.players[1].score;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Card className="space-y-4 text-center">
        <p className="text-grape flex items-center justify-center gap-1 text-sm font-bold"><Swords aria-hidden className="size-4" /> تحدي «{c.gameName}»</p>
        <div className="flex items-center justify-around">
          {c.players.map((p) => (
            <div key={p.userId} className="w-32 space-y-1">
              <div className="relative mx-auto w-fit">
                <Avatar avatar={p.avatar} size={72} />
                {winner?.userId === p.userId && !tie && <Crown aria-label="الفائز" className="text-sun absolute -top-4 start-1/2 size-7 -translate-x-1/2" fill="currentColor" />}
              </div>
              <p className="truncate font-bold">{p.isMe ? "أنت" : p.name}</p>
              <p className={cn("font-num text-3xl font-black", winner?.userId === p.userId && !tie && "text-mint")}>{p.score ?? (p.done ? "✓" : "…")}</p>
              {p.correct !== null && <p className="text-muted text-xs"><Num value={p.correct} /> من <Num value={c.total} /> صحيحة</p>}
            </div>
          ))}
          {c.players.length < 2 && (
            <div className="w-32 space-y-1 opacity-60">
              <div className="bg-surface-muted mx-auto grid size-[72px] place-items-center rounded-full text-2xl">؟</div>
              <p className="font-bold">صاحبك</p>
            </div>
          )}
        </div>
        {c.bothDone ? (
          <p className="font-display text-2xl font-bold">{tie ? "تعادل!" : winner?.isMe ? "فزت!" : `فاز ${other?.name.split(" ")[0]} — جولة انتقام؟`}</p>
        ) : (
          <CardHint>تظهر النتيجة عندما ينتهي الاثنان من نفس الأسئلة.</CardHint>
        )}
      </Card>

      {error && <p role="alert" className="bg-rose-soft text-rose rounded-xl px-4 py-3 text-sm">{ERR[error] ?? "تعذّر فتح التحدي."}</p>}

      {!me ? (
        c.players.length < 2 && c.expiresAt > new Date() ? (
          <form action={joinChallengeAction}>
            <input type="hidden" name="code" value={code} />
            <Button size="lg" block className="bg-grape h-14 text-lg text-white"><Swords aria-hidden className="size-5" /> اقبل التحدي والعب</Button>
            <CardHint className="mt-2 text-center">بقبولك تصبحان صديقين في لفظي.</CardHint>
          </form>
        ) : (
          <CardHint className="text-center">هذا التحدي مكتمل أو منتهٍ.</CardHint>
        )
      ) : !me.done ? (
        <form action={joinChallengeAction}><input type="hidden" name="code" value={code} /><Button size="lg" block>أكمل جولتك</Button></form>
      ) : (
        <div className="grid gap-2">
          {!other && <CardHint className="text-center">أرسل الرابط لصاحبك ليلعب نفس الجولة.</CardHint>}
          <ButtonLink href="/friends" variant="outline" block>تحدٍّ جديد</ButtonLink>
        </div>
      )}
    </div>
  );
}
