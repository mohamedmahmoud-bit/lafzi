/**
 * Production-safe content seed: levels, XP rules, badges, starter vocabulary and a default cohort.
 * Idempotent and non-destructive — existing rows (including admin edits) are never overwritten,
 * and no users or mock data are created. Runs on every Vercel build.   npm run db:seed:content
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { createDb } from "./client";
import * as s from "./schema";
import { SEED_BADGES, SEED_WORDS } from "./seed-data/words";
import { DEFAULT_LEVELS } from "../features/gamification/levels";
import { DEFAULT_XP_RULES } from "../features/gamification/xp-rules";
import { normalizeArabic } from "../lib/utils";

async function main() {
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  await db.insert(s.levels).values(DEFAULT_LEVELS).onConflictDoNothing();
  await db.insert(s.xpRules).values(Object.values(DEFAULT_XP_RULES)).onConflictDoNothing();
  await db.insert(s.badges).values(SEED_BADGES.map((b) => ({ ...b }))).onConflictDoNothing();

  let added = 0;
  for (const w of SEED_WORDS) {
    const [row] = await db
      .insert(s.vocabularyWords)
      .values({
        word: w.word,
        normalizedWord: normalizeArabic(w.word),
        meaning: w.meaning,
        example: w.example,
        relationNote: w.relationNote ?? null,
        difficulty: w.difficulty,
        category: w.category,
      })
      .onConflictDoNothing()
      .returning({ id: s.vocabularyWords.id });
    if (!row) continue; // already present (possibly edited by an admin) — leave it alone
    added++;
    await db.insert(s.wordSynonyms).values(w.synonyms.map((value) => ({ wordId: row.id, value })));
    if (w.antonyms.length) await db.insert(s.wordAntonyms).values(w.antonyms.map((value) => ({ wordId: row.id, value })));
  }

  // New students join the first cohort (until Noon exposes class/program membership).
  const [{ n }] = (await db.execute(sql`select count(*)::int as n from cohorts`)).rows as { n: number }[];
  if (n === 0) await db.insert(s.cohorts).values({ name: "طلاب لفظي", kind: "program" });

  await pool.end();
  console.log(`✓ content seed: ${added} new word(s); config rows ensured`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
