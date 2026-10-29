import { ChevronLeft, Lock } from "lucide-react";
import Link from "next/link";
import { Card, CardHint } from "@/components/ui/card";
import { Num } from "@/components/ui/num";
import { Pill } from "@/components/ui/pill";
import { requireUser } from "@/features/auth/dal";
import { getTaxonomy } from "@/features/curriculum/service";
import { MIN_ROUNDS } from "@/features/games/engine";
import { GAMES } from "@/features/games/modes";
import { availableRounds } from "@/features/games/session.service";
import { getDb } from "@/db/client";
import { gameTypes } from "@/db/schema";

export const metadata = { title: "العب" };

export default async function PlayHub() {
  await requireUser();
  const tax = await getTaxonomy();
  const status = new Map((await getDb().select().from(gameTypes)).map((g) => [g.id, g.status]));
  const games = await Promise.all(
    GAMES.map(async (g) => {
      const live = (status.get(g.id) ?? g.status) === "live";
      return { ...g, live, available: live ? await availableRounds(g.id) : 0 };
    }),
  );
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">العب</h1>
        <p className="text-muted mt-1">ست ألعاب، كل سؤال فيها من بنك أسئلة نون الرسمي.</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {games.map((g) => {
          const ready = g.live && g.available >= (g.source === "vocabulary" ? 2 : MIN_ROUNDS);
          const body = (
            <Card className={ready ? "hover:border-primary/40 h-full transition" : "h-full opacity-80"}>
              <div className="flex items-center justify-between">
                <span aria-hidden className="bg-primary-soft text-primary-ink font-num grid size-10 place-items-center rounded-xl text-lg font-bold">
                  {g.letter}
                </span>
                {!g.live ? (
                  <Pill><Lock aria-hidden className="size-3" /> قريبًا</Pill>
                ) : ready ? (
                  <Pill tone="success">متاحة</Pill>
                ) : (
                  <Pill tone="xp">لا يوجد محتوى منشور بعد</Pill>
                )}
              </div>
              <h2 className="mt-3 text-lg font-bold">{g.nameAr}</h2>
              <p className="text-muted text-xs">{tax.topic(g.topicId)?.nameAr}</p>
              <CardHint className="mt-2">{g.tagline}</CardHint>
              {ready && (
                <p className="text-primary-ink mt-3 flex items-center gap-1 text-sm font-semibold">
                  ابدأ <ChevronLeft aria-hidden className="size-4" />
                </p>
              )}
            </Card>
          );
          return g.live ? (
            <Link key={g.id} href={`/play/${g.id}`} className="rounded-brand block">
              {body}
            </Link>
          ) : (
            <div key={g.id}>{body}</div>
          );
        })}
      </div>
      <p className="text-muted text-xs">
        الألعاب لا تولّد أسئلة: إن لم يكن في بنك نون أسئلة منشورة كافية <Num value={MIN_ROUNDS} /> لموضوع ما، تظهر اللعبة بلا محتوى بدل اختراع أسئلة.
      </p>
    </div>
  );
}
