import { and, asc, eq, gt, inArray, isNotNull, lt, lte, sql } from "drizzle-orm";
import { getDb, type DbOrTx, type Tx } from "@/db/client";
import { gameSessionAnswers, journeyLevels, studentLevelProgress, studentVocabularyProgress } from "@/db/schema";
import { meaningRounds, relationForCategory, relationRounds } from "@/features/games/vocab-builders";
import type { LevelOutcome, Round } from "@/features/games/types";
import type { Lexicon } from "@/features/lexicon/content";
import { loadLexicon } from "@/features/lexicon/content";
import { seededRandom, shuffle } from "@/lib/utils";
/** Kept free of server-only imports: the deploy seed script (outside Next) builds the path too. */
const isProduction = () => process.env.NODE_ENV === "production";
import { planNewLevels, REVIEW_WORDS, STAGE_NAME, STAGES, starsFor, TEST_QUESTIONS, testPassMark } from "./plan";

export type JourneyLevel = typeof journeyLevels.$inferSelect;
type Item = { categoryId: string; entryId: string };
const itemKey = (i: Item) => `${i.categoryId}:${i.entryId}`;

/** Append levels for words that aren't on the path yet (idempotent; safe to run on every deploy). */
export async function syncJourney(db: DbOrTx, lx?: Lexicon) {
  lx ??= await loadLexicon(db, { isProduction: isProduction() });
  const existing = await db.select({ number: journeyLevels.number, kind: journeyLevels.kind, categoryId: journeyLevels.categoryId, entryIds: journeyLevels.entryIds }).from(journeyLevels);
  const planned = planNewLevels(lx, existing);
  if (planned.length) await db.insert(journeyLevels).values(planned).onConflictDoNothing();
  return planned.length;
}

/**
 * One-time upgrade of a path built before stage tests existed: lay the path out again with a test
 * closing each stage, KEEPING every existing level (same id, so students keep their stars/passes).
 * Runs only while the path has no test level.
 */
export async function insertStageTests(db: DbOrTx) {
  const [anyTest] = await db.select({ id: journeyLevels.id }).from(journeyLevels).where(eq(journeyLevels.kind, "test")).limit(1);
  if (anyTest) return 0;
  const existing = await db.select().from(journeyLevels).orderBy(asc(journeyLevels.number));
  if (!existing.length) return 0;
  const lx = await loadLexicon(db, { isProduction: isProduction() });
  const plan = planNewLevels(lx, []);
  const key = (cat: string | null, ids: string[]) => `${cat}:${[...ids].sort().join(",")}`;
  const learn = new Map(existing.filter((l) => l.kind === "learn").map((l) => [key(l.categoryId, l.entryIds), l]));
  const reviews = existing.filter((l) => l.kind === "review");
  const used = new Set<string>();
  const ordered: { id?: string; stage: string; categoryId: string | null; kind: string; entryIds: string[] }[] = [];
  for (const p of plan) {
    const hit = p.kind === "learn" ? learn.get(key(p.categoryId, p.entryIds)) : p.kind === "review" ? reviews.find((r) => !used.has(r.id)) : undefined;
    if (hit && !used.has(hit.id)) {
      used.add(hit.id);
      // A reused review takes the stage of its new position (reviews move when tests are inserted).
      ordered.push({ id: hit.id, stage: p.stage, categoryId: hit.categoryId, kind: hit.kind, entryIds: hit.entryIds });
    } else ordered.push({ stage: p.stage, categoryId: p.categoryId, kind: p.kind, entryIds: p.entryIds });
  }
  // Anything the fresh plan doesn't contain any more stays, at the end.
  for (const l of existing) if (!used.has(l.id)) ordered.push({ id: l.id, stage: l.stage, categoryId: l.categoryId, kind: l.kind, entryIds: l.entryIds });
  const run = async (tx: DbOrTx) => {
    await tx.update(journeyLevels).set({ number: sql`-${journeyLevels.number}` });
    for (const [i, l] of ordered.entries()) {
      if (l.id) await tx.update(journeyLevels).set({ number: i + 1, stage: l.stage }).where(eq(journeyLevels.id, l.id));
      else await tx.insert(journeyLevels).values({ number: i + 1, stage: l.stage, categoryId: l.categoryId, kind: l.kind, entryIds: l.entryIds });
    }
  };
  if ("transaction" in db) await (db as { transaction: (f: (tx: Tx) => Promise<void>) => Promise<void> }).transaction(run);
  else await run(db);
  return ordered.filter((l) => l.kind === "test").length;
}

/** Rounds for a set of words. With `retry`, each round carries a second version to re-ask it. */
function itemRounds(lx: Lexicon, items: Item[], rand: () => number, retry: boolean): Round[] {
  const byCat = new Map<string, string[]>();
  for (const i of items) byCat.set(i.categoryId, [...(byCat.get(i.categoryId) ?? []), i.entryId]);
  const build = (cat: string, ids: string[], r: () => number) => {
    const type = relationForCategory(cat);
    return type ? relationRounds(lx, type, { n: ids.length, rand: r, onlyEntries: ids }) : meaningRounds(lx, { n: ids.length, rand: r, category: cat, onlyEntries: ids });
  };
  const out: Round[] = [];
  for (const [cat, ids] of byCat) {
    const main = build(cat, ids, rand);
    const alts = retry ? new Map(build(cat, ids, seededRandom(Math.floor(rand() * 1e9))).map((r) => [r.entryIds?.[0], r])) : new Map<string | undefined, Round>();
    for (const r of main) {
      const entryId = r.entryIds?.[0];
      if (!entryId) continue;
      const alt = alts.get(entryId);
      out.push({
        ...r,
        item: { categoryId: cat, entryId },
        ...(retry ? { alt: alt ? { choices: alt.choices, correctId: alt.correctId } : { choices: shuffle(r.choices, rand), correctId: r.correctId } } : {}),
      });
    }
  }
  return shuffle(out, rand);
}

/** Words taught by learn levels of `stage` in (after, before). */
async function stageItems(db: DbOrTx, stage: string, after: number, before: number): Promise<Item[]> {
  const ls = await db.select().from(journeyLevels).where(and(eq(journeyLevels.kind, "learn"), eq(journeyLevels.stage, stage), gt(journeyLevels.number, after), lt(journeyLevels.number, before)));
  return ls.flatMap((l) => l.entryIds.map((entryId) => ({ categoryId: l.categoryId!, entryId })));
}

/** Rounds for one level (or the corrective level of a stage test). */
export async function levelRounds(db: DbOrTx, userId: string, level: JourneyLevel, lx: Lexicon, rand: () => number, mode: "play" | "corrective" = "play"): Promise<Round[]> {
  if (mode === "corrective") {
    const [p] = await db.select().from(studentLevelProgress).where(and(eq(studentLevelProgress.userId, userId), eq(studentLevelProgress.levelId, level.id))).limit(1);
    return itemRounds(lx, p?.missed ?? [], rand, true);
  }
  if (level.kind === "learn" && level.categoryId) return itemRounds(lx, level.entryIds.map((entryId) => ({ categoryId: level.categoryId!, entryId })), rand, true);

  if (level.kind === "test") {
    // The whole stage since the previous test: a mixed check, no second chances inside the test.
    const [prev] = await db.select({ n: journeyLevels.number }).from(journeyLevels).where(and(eq(journeyLevels.kind, "test"), lt(journeyLevels.number, level.number))).orderBy(sql`${journeyLevels.number} desc`).limit(1);
    const items = shuffle(await stageItems(db, level.stage, prev?.n ?? 0, level.number), rand).slice(0, TEST_QUESTIONS);
    return itemRounds(lx, items, rand, false);
  }

  // Review: words from earlier levels, the ones due (about to be forgotten) first, then the least known.
  const earlier = await db.select().from(journeyLevels).where(and(eq(journeyLevels.kind, "learn"), lte(journeyLevels.number, level.number)));
  const pairs = earlier.flatMap((l) => l.entryIds.map((entryId) => ({ categoryId: l.categoryId!, entryId })));
  const prog = await db.select().from(studentVocabularyProgress).where(eq(studentVocabularyProgress.userId, userId));
  const p = new Map(prog.map((x) => [x.entryId, x]));
  const now = Date.now();
  const rank = (e: string) => {
    const x = p.get(e);
    if (!x) return 2;
    return (x.nextReviewAt && x.nextReviewAt.getTime() <= now ? 0 : 1) * 10 + x.box;
  };
  const picked = shuffle(pairs, rand).sort((a, b) => rank(a.entryId) - rank(b.entryId)).slice(0, REVIEW_WORDS);
  return itemRounds(lx, picked, rand, true);
}

/** The first level the student hasn't passed (the path is unlocked in order). */
export async function currentLevel(db: DbOrTx, userId: string): Promise<JourneyLevel | null> {
  const passed = db.select({ id: studentLevelProgress.levelId }).from(studentLevelProgress).where(and(eq(studentLevelProgress.userId, userId), isNotNull(studentLevelProgress.passedAt)));
  const [l] = await db.select().from(journeyLevels).where(sql`${journeyLevels.id} not in (${passed})`).orderBy(asc(journeyLevels.number)).limit(1);
  return l ?? null;
}

/**
 * Score a finished level session inside the completion transaction.
 * - learn / review: complete only when EVERY word was answered correctly (the mastery loop re-asks
 *   missed words); stars from the first try.
 * - test: 90% to pass; missed words are kept for the corrective level.
 * - corrective: re-teaches the missed words; the test itself must then be passed.
 */
export async function finishLevel(tx: Tx, userId: string, s: { id: string; levelId: string; levelMode: string; rounds: Round[]; plannedRounds: number }): Promise<LevelOutcome | null> {
  const [level] = await tx.select().from(journeyLevels).where(eq(journeyLevels.id, s.levelId)).limit(1);
  if (!level) return null;
  const answers = (await tx.select().from(gameSessionAnswers).where(eq(gameSessionAnswers.sessionId, s.id))).sort((a, b) => a.roundIndex - b.roundIndex);
  const byItem = new Map<string, boolean[]>();
  const itemOf = new Map<string, Item>();
  // Rounds built before the mastery loop carry no `item`: derive it from the word the round asked about.
  const legacy = !s.rounds.some((r) => r.item);
  for (const a of answers) {
    const r = s.rounds[a.roundIndex];
    const it = r?.item ?? (r?.entryIds?.[0] ? { categoryId: level.categoryId ?? r.subskillId ?? "", entryId: r.entryIds[0] } : undefined);
    if (!it) continue;
    itemOf.set(itemKey(it), it);
    byItem.set(itemKey(it), [...(byItem.get(itemKey(it)) ?? []), a.isCorrect]);
  }
  const items = byItem.size;
  const firstTry = [...byItem.values()].filter((r) => r[0]).length;
  const [next] = await tx.select({ number: journeyLevels.number }).from(journeyLevels).where(eq(journeyLevels.number, level.number + 1)).limit(1);

  if (s.levelMode === "corrective") {
    return { number: level.number, kind: "corrective", passed: [...byItem.values()].every((r) => r.includes(true)), stars: 0, firstPass: false, nextNumber: level.number, items, firstTry };
  }

  let passed: boolean;
  let stars: number;
  let missed: Item[] = [];
  let passMark: number | undefined;
  if (level.kind === "test") {
    const correct = answers.filter((a) => a.isCorrect).length;
    passMark = testPassMark(s.plannedRounds);
    passed = correct >= passMark;
    stars = !passed ? 0 : correct === s.plannedRounds ? 3 : correct >= s.plannedRounds - 1 ? 2 : 1;
    missed = [...byItem].filter(([, r]) => !r[0]).map(([k]) => itemOf.get(k)!);
  } else if (legacy) {
    // No second chances existed in that round: pass on 75% at the first try (the old rule).
    passed = items > 0 && firstTry / items >= 0.75;
    stars = passed ? starsFor(firstTry, items) : 0;
  } else {
    passed = items > 0 && [...byItem.values()].every((r) => r.includes(true));
    stars = passed ? starsFor(firstTry, items) : 0;
  }

  const [before] = await tx.select().from(studentLevelProgress).where(and(eq(studentLevelProgress.userId, userId), eq(studentLevelProgress.levelId, level.id))).limit(1);
  const firstPass = passed && !before?.passedAt;
  await tx
    .insert(studentLevelProgress)
    .values({ userId, levelId: level.id, stars, bestCorrect: firstTry, attempts: 1, passedAt: passed ? new Date() : null, missed })
    .onConflictDoUpdate({
      target: [studentLevelProgress.userId, studentLevelProgress.levelId],
      set: {
        stars: sql`greatest(${studentLevelProgress.stars}, ${stars})`,
        bestCorrect: sql`greatest(${studentLevelProgress.bestCorrect}, ${firstTry})`,
        attempts: sql`${studentLevelProgress.attempts} + 1`,
        passedAt: passed ? sql`coalesce(${studentLevelProgress.passedAt}, now())` : studentLevelProgress.passedAt,
        missed,
      },
    });
  return { number: level.number, kind: level.kind, passed, stars, firstPass, nextNumber: passed ? (next?.number ?? null) : level.number, items, firstTry, passMark, missed: missed.length };
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
