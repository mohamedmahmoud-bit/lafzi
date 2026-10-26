import "server-only";
import { getDb, type DbOrTx } from "@/db/client";
import { auditEvents } from "@/db/schema";

export async function audit(
  entry: {
    actorUserId: string | null;
    action: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  },
  db: DbOrTx = getDb(),
) {
  await db.insert(auditEvents).values({ ...entry, metadata: entry.metadata ?? {} });
}
