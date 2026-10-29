import type { DbOrTx } from "@/db/client";
import { verbalSubskills, verbalTopics } from "@/db/schema";
import { NOON_VERBAL_CURRICULUM, subskillIdFor } from "./noon-verbal-curriculum";

/** Upsert topics/subskills from the curriculum snapshot (idempotent; keeps admin edits to names). */
export async function seedTaxonomy(db: DbOrTx) {
  for (const t of NOON_VERBAL_CURRICULUM) {
    await db
      .insert(verbalTopics)
      .values({ id: t.slug, nameAr: t.nameAr, noonChapterId: t.noonChapterId, sort: t.sort })
      .onConflictDoUpdate({ target: verbalTopics.id, set: { noonChapterId: t.noonChapterId, sort: t.sort } });
    for (const [i, s] of t.subskills.entries()) {
      const id = s.id ?? subskillIdFor(s.noonSubtopicId!);
      await db
        .insert(verbalSubskills)
        .values({ id, topicId: t.slug, nameAr: s.nameAr, noonTopicId: s.noonTopicId, noonSubtopicId: s.noonSubtopicId, sort: i })
        .onConflictDoUpdate({ target: verbalSubskills.id, set: { topicId: t.slug, noonTopicId: s.noonTopicId, sort: i } });
    }
  }
}

