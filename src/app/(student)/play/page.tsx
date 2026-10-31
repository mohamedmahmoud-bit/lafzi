import { ChevronLeft, Zap } from "lucide-react";
import Link from "next/link";
import { GameIcon } from "@/components/game/game-icon";
import { Button } from "@/components/ui/button";
import { Card, CardHint } from "@/components/ui/card";
import { Num } from "@/components/ui/num";
import { Pill } from "@/components/ui/pill";
import { getDb } from "@/db/client";
import { entryCategories, vocabularyEntries } from "@/db/schema";
import { requireUser } from "@/features/auth/dal";
import { getTaxonomy } from "@/features/curriculum/service";
import { startGameAction } from "@/features/games/actions";
import { PLAY_GAMES, QUDURAT_GAMES } from "@/features/games/modes";
import { isPlayable } from "@/features/games/session.service";
import { and, eq, isNull, sql } from "drizzle-orm";

export const metadata = { title: "العب" };

export default async function PlayHub() {
  await requireUser();
  const tax = await getTaxonomy();
  const games = await Promise.all(PLAY_GAMES.map(async (g) => ({ ...g, playable: await isPlayable(g.id) })));
  const counts = await getDb()
    .select({ c: entryCategories.categoryId, n: sql<number>`count(*)::int` })
    .from(entryCategories)
    .innerJoin(vocabularyEntries, eq(vocabularyEntries.id, entryCategories.entryId))
    .where(and(eq(vocabularyEntries.status, "approved"), isNull(vocabularyEntries.mergedInto)))
    .groupBy(entryCategories.categoryId);
  const count = new Map(counts.map((c) => [c.c, c.n]));
  const qudurat = await Promise.all(QUDURAT_GAMES.map(async (g) => ({ ...g, playable: await isPlayable(g.id) })));
  const anyPlayable = games.some((g) => g.playable);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">العب</h1>
          <p className="text-muted">جولات قصيرة، كلمات حقيقية، ونقاط على كل إجابة صحيحة.</p>
        </div>
        {anyPlayable && (
          <form action={startGameAction}>
            <input type="hidden" name="gameId" value={games.find((g) => g.playable)!.id} />
            <Button size="lg" className="bg-flame text-white"><Zap aria-hidden className="size-5" /> لعب سريع</Button>
          </form>
        )}
      </header>

      <ul className="grid gap-3 sm:grid-cols-2">
        {games.map((g) => (
          <li key={g.id}>
            <Link href={`/play/${g.id}`} className="rounded-brand block h-full">
              <Card className="hover:border-primary/40 flex h-full items-center gap-4 transition active:scale-[0.99]">
                <GameIcon icon={g.icon} gameId={g.id} className="size-14" />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-xl font-bold">{g.nameAr}</p>
                  <p className="text-muted text-sm">{g.tagline}</p>
                  {!g.playable && <Pill tone="xp" className="mt-1">بانتظار كلمات معتمدة</Pill>}
                </div>
                <ChevronLeft aria-hidden className="text-muted size-5" />
              </Card>
            </Link>
          </li>
        ))}
      </ul>

      <section aria-labelledby="cats" className="space-y-2">
        <h2 id="cats" className="font-bold">استكشف الأقسام</h2>
        <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {tax.subskillsOf("vocabulary").map((c) => (
            <li key={c.id} className="shrink-0">
              <Link href={`/play/meaning_hunter?category=${c.id}`} className="bg-surface border-border hover:border-sky block rounded-2xl border px-4 py-3">
                <p className="font-bold">{c.nameAr}</p>
                <p className="text-muted text-xs"><Num value={count.get(c.id) ?? 0} /> كلمة</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <details className="bg-surface border-border rounded-brand border p-4">
        <summary className="cursor-pointer font-bold">تدريب قدرات (أسئلة من بنك نون)</summary>
        <CardHint className="mt-1">أسئلة القدرات الرسمية كما هي — للتدريب الإضافي.</CardHint>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {qudurat.map((g) => (
            <li key={g.id}>
              <Link href={`/play/${g.id}`} className="hover:bg-surface-muted flex items-center gap-3 rounded-xl border border-border p-3">
                <GameIcon icon={g.icon} gameId={g.id} className="size-10" />
                <span className="flex-1 font-semibold">{g.nameAr}</span>
                {!g.playable && <Pill>لا يوجد محتوى</Pill>}
              </Link>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
