import "dotenv/config";
import { Pool } from "pg";
import { poolConfig } from "./client";

/** Development only: drops and recreates the public schema. */
async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("db:reset is disabled in production");
  const pool = new Pool(poolConfig());
  await pool.query(
    "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;",
  );
  await pool.end();
  console.log("✓ database reset");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
