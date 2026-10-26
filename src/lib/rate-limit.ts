import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

export class RateLimitError extends Error {
  constructor() {
    super("rate_limited");
  }
}

/**
 * Fixed-window limiter stored in Postgres so it works across multiple app instances (ECS/EB)
 * without extra infrastructure. Swap for Redis/ElastiCache if traffic requires it.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const db = getDb();
  const windowStart = new Date(
    Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000,
  );
  const res = await db.execute<{ count: number }>(sql`
    INSERT INTO rate_limit_buckets (key, window_start, count)
    VALUES (${key}, ${windowStart.toISOString()}, 1)
    ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limit_buckets.count + 1
    RETURNING count`);
  // Opportunistic cleanup of old windows (cheap, indexed by PK prefix scan avoided by time filter).
  if (Math.random() < 0.01) {
    await db.execute(
      sql`DELETE FROM rate_limit_buckets WHERE window_start < now() - interval '1 day'`,
    );
  }
  return Number(res.rows[0]?.count ?? 0) <= limit;
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number) {
  if (!(await rateLimit(key, limit, windowSeconds))) throw new RateLimitError();
}
