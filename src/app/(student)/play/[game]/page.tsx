import { Clock, Lightbulb, Play } from "lucide-react";
import { notFound } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHint, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/features/auth/dal";
import { getTaxonomy } from "@/features/curriculum/service";
import { MIN_ROUNDS, TIMED_ROUND_MS } from "@/features/games/engine";
import { startGameAction } from "@/features/games/actions";
import { gameById } from "@/features/games/modes";
import { availableRounds } from "@/features/games/session.service";
import { getDb } from "@/db/client";
import { gameTypes } from "@/db/schema";
import { eq } from "drizzle-orm";

/** Strategy prompts: students derive the method; we never hand them the answer pattern. */
const WARMUP: Record<string, string[]> = {
  relations_hunter: [
    "قبل النظر للخيارات: كوّن جملة قصيرة تربط كلمتي السؤال.",
    "ضع كل خيار في جملتك نفسها — أيّها يحافظ على المعنى والاتجاه؟",
    "انتبه: هل ترتيب الكلمتين في الخيار مثل ترتيبهما في السؤال؟",
  ],
  complete_mission: [
    "اقرأ الجملة كاملة قبل الخيارات، وتوقّع نوع الكلمة الناقصة.",
    "ابحث عن أداة الربط: هل تدل على توافق أم تعارض أم سبب؟",
    "بعد اختيارك، أعد قراءة الجملة كاملة: هل يستقيم المعنى؟",
  ],
  word_treasure: [
    "كل كلمة هنا ظهرت في سؤال حقيقي من بنك نون.",
    "قبل الإجابة: هل الكلمتان تتفقان في المعنى أم تتعاكسان؟ لماذا؟",
  ],
};

const ERROR_TEXT: Record<string, string> = {
  content_unavailable: "لا توجد أسئلة منشورة كافية من بنك نون لهذه اللعبة الآن.",
  not_live: "هذه اللعبة غير متاحة بعد.",
};

export default async function GamePage({ params, searchParams }: { params: Promise<{ game: string }>; searchParams: Promise<{ error?: string }> }) {
  await requireUser();
  const { game } = await params;
  const { error } = await searchParams;
  const g = gameById(game);
  if (!g) notFound();
  const [row] = await getDb().select().from(gameTypes).where(eq(gameTypes.id, g.id)).limit(1);
  const live = (row?.status ?? g.status) === "live";
  const tax = await getTaxonomy();
  const available = live ? await availableRounds(g.id) : 0;
  const enough = available >= (g.source === "vocabulary" ? 2 : MIN_ROUNDS);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <p className="text-muted text-sm">لعبة {g.letter} · {tax.topic(g.topicId)?.nameAr}</p>
        <h1 className="text-2xl font-bold">{g.nameAr}</h1>
        <p className="text-muted mt-2">{g.description}</p>
      </Card>

      {error && ERROR_TEXT[error] && (
        <p role="alert" className="bg-xp-soft text-xp rounded-xl px-4 py-3 text-sm">{ERROR_TEXT[error]}</p>
      )}

      {!live || !enough ? (
        <Card className="text-center">
          <CardTitle>{live ? "لا يوجد محتوى منشور بعد" : "قريبًا"}</CardTitle>
          <CardHint className="mt-2">
            {live
              ? "هذه اللعبة تعمل فقط على أسئلة بنك نون بعد مراجعتها ونشرها. لن نعرض أسئلة مولّدة بديلة."
              : "اللعبة قيد الإعداد."}
          </CardHint>
          <ButtonLink href="/play" variant="outline" className="mt-4">كل الألعاب</ButtonLink>
        </Card>
      ) : (
        <>
          {WARMUP[g.id] && (
            <Card>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb aria-hidden className="text-xp size-5" /> قبل أن تبدأ
              </CardTitle>
              <ol className="text-muted mt-2 list-decimal space-y-1 ps-5 text-sm">
                {WARMUP[g.id].map((w) => <li key={w}>{w}</li>)}
              </ol>
            </Card>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <form action={startGameAction}>
              <input type="hidden" name="gameId" value={g.id} />
              <Button size="lg" block type="submit">
                <Play aria-hidden className="size-5" /> جولة عادية
              </Button>
            </form>
            <form action={startGameAction}>
              <input type="hidden" name="gameId" value={g.id} />
              <input type="hidden" name="timed" value="1" />
              <Button size="lg" block variant="outline" type="submit">
                <Clock aria-hidden className="size-5" /> تحدي الوقت ({Math.round(TIMED_ROUND_MS / 1000)} ث)
              </Button>
            </form>
          </div>
          <CardHint className="text-center">التلميح يحذف خيارًا خاطئًا واحدًا ويقلّل نقاط السؤال للنصف.</CardHint>
        </>
      )}
    </div>
  );
}
