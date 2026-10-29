import type { DbOrTx } from "./client";
import * as s from "./schema";
import { SEED_BADGES } from "./seed-data/words";
import { seedTaxonomy } from "../features/curriculum/seed";
import { seedGameTypes } from "../features/games/seed";
import { DEFAULT_LEVELS } from "../features/gamification/levels";
import { DEFAULT_XP_RULES } from "../features/gamification/xp-rules";

/**
 * Configuration every environment needs: canonical taxonomy (official Noon IDs), game types,
 * levels, XP rules and badges. Idempotent and non-destructive. Contains NO questions or words.
 */
export async function seedPlatformConfig(db: DbOrTx) {
  await seedTaxonomy(db);
  await seedGameTypes(db);
  await db.insert(s.levels).values(DEFAULT_LEVELS).onConflictDoNothing();
  await db.insert(s.xpRules).values(Object.values(DEFAULT_XP_RULES)).onConflictDoNothing();
  await db.insert(s.badges).values(SEED_BADGES.map((b) => ({ ...b }))).onConflictDoNothing();
}
