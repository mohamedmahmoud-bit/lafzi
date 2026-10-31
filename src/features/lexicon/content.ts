import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { entryCategories, vocabularyEntries, vocabularyRelationships, wordSenses } from "@/db/schema";
import type { RelationType } from "./mapping";

export type LexEntry = { id: string; lemma: string; difficulty: number; categories: string[] };
export type LexSense = { id: string; entryId: string; meaning: string; example: string | null; difficulty: number };
export type LexRelation = { id: string; type: RelationType; fromId: string; toId: string; example: string | null };
export type Lexicon = { entries: Map<string, LexEntry>; senses: LexSense[]; relations: LexRelation[] };

/** Everything students may see: approved, unmerged entries; approved senses and relationships only. */
export async function loadLexicon(db: DbOrTx, opts: { isProduction: boolean }): Promise<Lexicon> {
  const ents = await db
    .select()
    .from(vocabularyEntries)
    .where(and(eq(vocabularyEntries.status, "approved"), isNull(vocabularyEntries.mergedInto), ...(opts.isProduction ? [eq(vocabularyEntries.isMock, false)] : [])));
  const ids = ents.map((e) => e.id);
  if (!ids.length) return { entries: new Map(), senses: [], relations: [] };
  const cats = await db.select().from(entryCategories).where(inArray(entryCategories.entryId, ids));
  const entries = new Map<string, LexEntry>(
    ents.map((e) => [e.id, { id: e.id, lemma: e.lemma, difficulty: e.difficulty, categories: cats.filter((c) => c.entryId === e.id).map((c) => c.categoryId) }]),
  );
  const senses = (await db.select().from(wordSenses).where(and(eq(wordSenses.status, "approved"), inArray(wordSenses.entryId, ids))))
    .map((s) => ({ id: s.id, entryId: s.entryId, meaning: s.meaning, example: s.example, difficulty: s.difficulty }));
  const relations = (await db.select().from(vocabularyRelationships).where(eq(vocabularyRelationships.status, "approved")))
    .filter((r) => entries.has(r.fromEntryId) && entries.has(r.toEntryId))
    .map((r) => ({ id: r.id, type: r.type as RelationType, fromId: r.fromEntryId, toId: r.toEntryId, example: r.example }));
  return { entries, senses, relations };
}
