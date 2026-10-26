/**
 * Rebuild cached XP totals and levels on student_profiles from the xp_transactions ledger
 * (the source of truth). Safe to run anytime.   npm run xp:reconcile
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { createDb } from "./client";

async function main() {
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  const res = await db.execute(sql`
    with totals as (
      select p.user_id, coalesce(sum(t.xp), 0)::int as xp
      from student_profiles p left join xp_transactions t on t.user_id = p.user_id
      group by p.user_id
    )
    update student_profiles p
    set xp_total = totals.xp,
        current_level = coalesce((select max(level) from levels l where l.min_xp <= totals.xp), 1)
    from totals
    where totals.user_id = p.user_id and (p.xp_total <> totals.xp
      or p.current_level <> coalesce((select max(level) from levels l where l.min_xp <= totals.xp), 1))`);
  await pool.end();
  console.log(`✓ reconciled ${res.rowCount ?? 0} profile(s)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
