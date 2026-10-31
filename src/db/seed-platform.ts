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

/** Stage the supplied initial vocabulary dataset (idempotent by file hash). Nothing is published here. */
export async function stageInitialDataset(db: import("./client").Db) {
  const { readFileSync, existsSync } = await import("node:fs");
  const path = "data/vocabulary/lafzi-initial-427.md";
  if (!existsSync(path)) return null;
  const { importDataset } = await import("../features/lexicon/service");
  return importDataset(db, { text: readFileSync(path, "utf8"), sourceName: "lafzi-initial-427.md", format: "markdown", sourceKind: "dataset" });
}
