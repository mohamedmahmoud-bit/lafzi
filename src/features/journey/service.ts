import { and, asc, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { getDb, type DbOrTx, type Tx } from "@/db/client";
import { journeyLevels, studentLevelProgress, studentVocabularyProgress } from "@/db/schema";
import { meaningRounds, relationForCategory, relationRounds } from "@/features/games/vocab-builders";
import type { Round } from "@/features/games/types";
import type { Lexicon } from "@/features/lexicon/content";
import { loadLexicon } from "@/features/lexicon/content";
import { shuffle } from "@/lib/utils";
/** Kept free of server-only imports: the deploy seed script (outside Next) builds the path too. */
const isProduction = () => process.env.NODE_ENV === "production";
import { planNewLevels, ROUNDS_PER_LEVEL, STAGE_NAME, STAGES, starsFor, passMark } from "./plan";

export type JourneyLevel = typeof journeyLevels.$inferSelect;

/** Append levels for words that aren't on the path yet (idempotent; safe to run on every deploy). */
export async function syncJourney(db: DbOrTx, lx?: Lexicon) {
  lx ??= await loadLexicon(db, { isProduction: isProduction() });
  const existing = await db.select({ number: journeyLevels.number, kind: journeyLevels.kind, categoryId: journeyLevels.categoryId, entryIds: journeyLevels.entryIds }).from(journeyLevels);
  const planned = planNewLevels(lx, existing);
  if (planned.length) await db.insert(journeyLevels).values(planned).onConflictDoNothing();
  return planned.length;
}

/** Rounds for one level: the level's words (meaning or pair questions), or a review of met words. */
export async function levelRounds(db: DbOrTx, userId: string, level: JourneyLevel, lx: Lexicon, rand: () => number): Promise<Round[]> {
  const build = (categoryId: string, entryIds: string[], n: number) => {
    const type = relationForCategory(categoryId);
    return type ? relationRounds(lx, type, { n, rand, onlyEntries: entryIds }) : meaningRounds(lx, { n, rand, category: categoryId, onlyEntries: entryIds });
  };
  if (level.kind === "learn" && level.categoryId) return build(level.categoryId, level.entryIds, ROUNDS_PER_LEVEL);

  // Review: words from levels before this one, due words first, then the least-known ones.
  const earlier = await db.select().from(journeyLevels).where(and(eq(journeyLevels.kind, "learn"), lte(journeyLevels.number, level.number)));
  const pairs = earlier.flatMap((l) => l.entryIds.map((e) => ({ cat: l.categoryId!, e })));
  const prog = await db.select().from(studentVocabularyProgress).where(eq(studentVocabularyProgress.userId, userId));
  const p = new Map(prog.map((x) => [x.entryId, x]));
  const now = Date.now();
  const rank = (e: string) => {
    const x = p.get(e);
    if (!x) return 2;
    return (x.nextReviewAt && x.nextReviewAt.getTime() <= now ? 0 : 1) * 10 + x.box;
  };
  const picked = shuffle(pairs, rand).sort((a, b) => rank(a.e) - rank(b.e)).slice(0, 12);
  const byCat = new Map<string, string[]>();
  for (const x of picked) byCat.set(x.cat, [...(byCat.get(x.cat) ?? []), x.e]);
  const rounds = [...byCat].flatMap(([cat, ids]) => build(cat, ids, ids.length));
  return shuffle(rounds, rand).slice(0, ROUNDS_PER_LEVEL);
}

/** The first level the student hasn't passed (the path is unlocked in order). */
export async function currentLevel(db: DbOrTx, userId: string): Promise<JourneyLevel | null> {
  const passed = db.select({ id: studentLevelProgress.levelId }).from(studentLevelProgress).where(and(eq(studentLevelProgress.userId, userId), isNotNull(studentLevelProgress.passedAt)));
  const [l] = await db.select().from(journeyLevels).where(sql`${journeyLevels.id} not in (${passed})`).orderBy(asc(journeyLevels.number)).limit(1);
  return l ?? null;
}

export type LevelResult = { number: number; kind: string; passed: boolean; stars: number; passMark: number; firstPass: boolean; nextNumber: number | null };

/** Record a finished level inside the completion transaction. */
export async function recordLevelResult(tx: Tx, userId: string, levelId: string, correct: number, planned: number): Promise<LevelResult | null> {
  const [level] = await tx.select().from(journeyLevels).where(eq(journeyLevels.id, levelId)).limit(1);
  if (!level) return null;
  const stars = starsFor(correct, planned);
  const passed = stars > 0;
  const [before] = await tx.select().from(studentLevelProgress).where(and(eq(studentLevelProgress.userId, userId), eq(studentLevelProgress.levelId, levelId))).limit(1);
  const firstPass = passed && !before?.passedAt;
  await tx
    .insert(studentLevelProgress)
    .values({ userId, levelId, stars, bestCorrect: correct, attempts: 1, passedAt: passed ? new Date() : null })
    .onConflictDoUpdate({
      target: [studentLevelProgress.userId, studentLevelProgress.levelId],
      set: {
        stars: sql`greatest(${studentLevelProgress.stars}, ${stars})`,
        bestCorrect: sql`greatest(${studentLevelProgress.bestCorrect}, ${correct})`,
        attempts: sql`${studentLevelProgress.attempts} + 1`,
        passedAt: passed ? sql`coalesce(${studentLevelProgress.passedAt}, now())` : studentLevelProgress.passedAt,
      },
    });
  const [next] = await tx.select({ number: journeyLevels.number }).from(journeyLevels).where(eq(journeyLevels.number, level.number + 1)).limit(1);
  return { number: level.number, kind: level.kind, passed, stars, passMark: passMark(planned), firstPass, nextNumber: passed ? (next?.number ?? null) : level.number };
}

export type JourneyMap = {
  current: { number: number; stage: string; stageName: string; kind: string } | null;
  stages: { id: string; nameAr: string; levels: { number: number; kind: string; stars: number; passed: boolean; locked: boolean }[]; passed: number }[];
  passedLevels: number;
  totalLevels: number;
};

export async function getJourney(userId: string): Promise<JourneyMap> {
  const db = getDb();
  let levels = await db.select().from(journeyLevels).orderBy(asc(journeyLevels.number));
  if (!levels.length) {
    await syncJourney(db);
    levels = await db.select().from(journeyLevels).orderBy(asc(journeyLevels.number));
  }
  const prog = levels.length ? await db.select().from(studentLevelProgress).where(and(eq(studentLevelProgress.userId, userId), inArray(studentLevelProgress.levelId, levels.map((l) => l.id)))) : [];
  const byLevel = new Map(prog.map((p) => [p.levelId, p]));
  const cur = levels.find((l) => !byLevel.get(l.id)?.passedAt) ?? null;
  // Consecutive runs of one stage form a section of the map (new words appended later get their own run).
  const stages: JourneyMap["stages"] = [];
  for (const l of levels) {
    const p = byLevel.get(l.id);
    const item = { number: l.number, kind: l.kind, stars: p?.stars ?? 0, passed: !!p?.passedAt, locked: !!cur && l.number > cur.number };
    const last = stages[stages.length - 1];
    if (last && last.id === l.stage) last.levels.push(item);
    else stages.push({ id: l.stage, nameAr: STAGE_NAME[l.stage] ?? l.stage, levels: [item], passed: 0 });
  }
  for (const s of stages) s.passed = s.levels.filter((x) => x.passed).length;
  return {
    current: cur ? { number: cur.number, stage: cur.stage, stageName: STAGE_NAME[cur.stage] ?? cur.stage, kind: cur.kind } : null,
    stages,
    passedLevels: prog.filter((p) => p.passedAt).length,
    totalLevels: levels.length,
  };
}

export { STAGES };
