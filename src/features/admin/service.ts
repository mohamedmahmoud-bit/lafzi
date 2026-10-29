import "server-only";
import { desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditEvents } from "@/db/schema";

export async function recentAudit(limit = 100) {
  return getDb().select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(limit);
}
