import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./client";

async function main() {
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log("✓ migrations applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
