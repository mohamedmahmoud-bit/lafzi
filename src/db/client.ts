import { readFileSync } from "node:fs";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;
/** A transaction handle has the same query API as the db. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

export function poolConfig(url = process.env.DATABASE_URL): PoolConfig {
  if (!url) throw new Error("DATABASE_URL is not set");
  const ssl = process.env.DATABASE_SSL === "require";
  const caPath = process.env.DATABASE_SSL_CA_PATH;
  return {
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    ssl: ssl
      ? { rejectUnauthorized: true, ...(caPath ? { ca: readFileSync(caPath, "utf8") } : {}) }
      : undefined,
  };
}

const globalForDb = globalThis as unknown as { lafziPool?: Pool; lafziDb?: Db };

/** Lazily created singleton (survives dev hot reloads). */
export function getDb(): Db {
  if (!globalForDb.lafziDb) {
    globalForDb.lafziPool = new Pool(poolConfig());
    globalForDb.lafziDb = drizzle(globalForDb.lafziPool, { schema });
  }
  return globalForDb.lafziDb;
}

export function createDb(url: string): { db: Db; pool: Pool } {
  const pool = new Pool(poolConfig(url));
  return { db: drizzle(pool, { schema }), pool };
}

export { schema };
