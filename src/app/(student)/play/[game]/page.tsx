import { Clock, Play } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { GameIcon } from "@/components/game/game-icon";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHint, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/features/auth/dal";
import { getTaxonomy } from "@/features/curriculum/service";
import { startGameAction } from "@/features/games/actions";
import { gameById } from "@/features/games/modes";
import { isPlayable } from "@/features/games/session.service";
import { RELATION_TEXT, type RelationType } from "@/features/lexicon/mapping";
import { cn } from "@/lib/utils";

const ERROR_TEXT: Record<string, string> = {
  content_unavailable: "لا توجد كلمات معتمدة كافية لهذه اللعبة أو هذا القسم الآن.",
  not_live: "هذه اللعبة غير متاحة.",
};
const BOARD_TYPES: RelationType[] = ["sound", "animal_young", "animal_home", "animal_female", "plural", "verb_present", "synonym", "antonym"];
const BOARD_LABEL: Record<RelationType, string> = { sound: "الأصوات", animal_young: "الصغار", animal_home: "المساكن", animal_female: "الأزواج", plural: "الجموع", verb_present: "الأفعال", synonym: "المرادفات", antonym: "الأضداد" };

export default async function GamePage({ params, searchParams }: { params: Promise<{ game: string }>; searchParams: Promise<{ error?: string; category?: string }> }) {
  await requireUser();
  const { game } = await params;
  const sp = await searchParams;
  const g = gameById(game);
  if (!g || g.status !== "live") notFound();
  if (g.id === "daily_challenge") redirect("/");
  const tax = await getTaxonomy();
  const playable = await isPlayable(g.id);
  const category = tax.subskill(sp.category ?? "")?.id;
  const usesCategory = g.mechanic === "mcq" || g.mechanic === "race";
  const usesBoard = g.mechanic === "match" || g.mechanic === "memory";

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Card className="flex items-center gap-4">
        <GameIcon icon={g.icon} gameId={g.id} className="size-16" />
        <div>
          <h1 className="font-display text-3xl font-bold">{g.nameAr}</h1>
          <p className="text-muted">{g.description}</p>
          <p className="text-muted mt-1 flex items-center gap-1 text-xs"><Clock aria-hidden className="size-3.5" /> نحو {g.minutes} دقائق</p>
        </div>
      </Card>

      {sp.error && ERROR_TEXT[sp.error] && <p role="alert" className="bg-sun-soft rounded-xl px-4 py-3 text-sm font-semibold">{ERROR_TEXT[sp.error]}</p>}

      {!playable ? (
        <Card className="text-center">
          <CardTitle>بانتظار كلمات معتمدة</CardTitle>
          <CardHint className="mt-2">تظهر الجولات بعد مراجعة الكلمات واعتمادها — لا نعرض محتوى غير معتمد.</CardHint>
          <ButtonLink href="/play" variant="outline" className="mt-4">ألعاب أخرى</ButtonLink>
        </Card>
      ) : (
        <>
          <form action={startGameAction}>
            <input type="hidden" name="gameId" value={g.id} />
            {category && <input type="hidden" name="category" value={category} />}
            <Button size="lg" block className="h-16 text-xl"><Play aria-hidden className="size-6" /> ابدأ{category ? ` — ${tax.subskill(category)?.nameAr}` : ""}</Button>
          </form>

          {usesCategory && g.source === "lexicon" && (
            <Card>
              <CardTitle className="text-sm">أو اختر قسمًا</CardTitle>
              <div className="mt-2 flex flex-wrap gap-2">
                {tax.subskillsOf("vocabulary").map((c) => (
                  <a key={c.id} href={`/play/${g.id}?category=${c.id}`} className={cn("rounded-full border px-3 py-1.5 text-sm", c.id === category ? "border-sky bg-sky-soft font-bold" : "border-border")}>
                    {c.nameAr}
                  </a>
                ))}
              </div>
            </Card>
          )}
          {usesBoard && (
            <Card>
              <CardTitle className="text-sm">اختر نوع الأزواج</CardTitle>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {BOARD_TYPES.map((t) => (
                  <form key={t} action={startGameAction}>
                    <input type="hidden" name="gameId" value={g.id} />
                    <input type="hidden" name="relationType" value={t} />
                    <Button variant="outline" block size="sm" title={RELATION_TEXT[t].pairHint}>{BOARD_LABEL[t]}</Button>
                  </form>
                ))}
              </div>
            </Card>
          )}
          {g.mechanic === "race" && <CardHint className="text-center">٧٥ ثانية. الإجابة الصحيحة تكسب نقاطًا، والسرعة المعقولة تضيف مكافأة. التخمين العشوائي لا يفيد.</CardHint>}
        </>
      )}
    </div>
  );
}
