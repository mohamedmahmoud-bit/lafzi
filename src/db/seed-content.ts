/**
 * Production-safe content seed: taxonomy, game types, levels, XP rules, badges and a default cohort.
 * Idempotent and non-destructive. It inserts NO questions and NO vocabulary — those come only from
 * the Noon question bank via sync + review. Runs on every Vercel build.   npm run db:seed:content
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { createDb } from "./client";
import * as s from "./schema";
import { seedPlatformConfig } from "./seed-platform";

async function main() {
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  await seedPlatformConfig(db);

  // New students join the first cohort (until Noon exposes class/program membership).
  const [{ n }] = (await db.execute(sql`select count(*)::int as n from cohorts`)).rows as { n: number }[];
  if (n === 0) await db.insert(s.cohorts).values({ name: "طلاب لفظي", kind: "program" });

  await pool.end();
  console.log("✓ content seed: taxonomy, game types and config rows ensured (no questions or words)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
