import type { DbOrTx } from "@/db/client";
import { gameTypes } from "@/db/schema";
import { GAMES } from "./modes";

/** Insert the six game types (keeps an admin's live/coming-soon choice on re-run). */
export async function seedGameTypes(db: DbOrTx) {
  for (const g of GAMES) {
    await db
      .insert(gameTypes)
      .values({ id: g.id, nameAr: g.nameAr, topicId: g.topicId, description: g.description, status: g.status, sort: g.sort })
      .onConflictDoUpdate({ target: gameTypes.id, set: { nameAr: g.nameAr, topicId: g.topicId, description: g.description, status: g.status, sort: g.sort } });
  }
}
