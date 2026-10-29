import "server-only";
import { asc, eq } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "@/db/client";
import { verbalSubskills, verbalTopics } from "@/db/schema";

export type Topic = typeof verbalTopics.$inferSelect;
export type Subskill = typeof verbalSubskills.$inferSelect;

export { seedTaxonomy } from "./seed";

export const getTaxonomy = cache(async () => {
  const db = getDb();
  const [topics, subskills] = [
    await db.select().from(verbalTopics).where(eq(verbalTopics.enabled, true)).orderBy(asc(verbalTopics.sort)),
    await db.select().from(verbalSubskills).where(eq(verbalSubskills.enabled, true)).orderBy(asc(verbalSubskills.sort)),
  ];
  return {
    topics,
    subskills,
    topic: (id: string) => topics.find((t) => t.id === id) ?? null,
    subskill: (id: string) => subskills.find((s) => s.id === id) ?? null,
    subskillsOf: (topicId: string) => subskills.filter((s) => s.topicId === topicId),
    byNoonSubtopic: (noonId: number) => subskills.find((s) => s.noonSubtopicId === noonId) ?? null,
    byNoonChapter: (noonId: number) => topics.find((t) => t.noonChapterId === noonId) ?? null,
  };
});
export type Taxonomy = Awaited<ReturnType<typeof getTaxonomy>>;
