import "server-only";
import { eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { vocabularyWords, wordAntonyms, wordSynonyms } from "@/db/schema";
import type { QuizWord } from "./questions";

export type WordCard = QuizWord & {
  relationNote: string | null;
  category: string;
};

/** Load words with their synonyms/antonyms. `ids` undefined = all active words. */
export async function loadWords(db: DbOrTx, ids?: string[]): Promise<WordCard[]> {
  if (ids && ids.length === 0) return [];
  const rows = await db
    .select()
    .from(vocabularyWords)
    .where(ids ? inArray(vocabularyWords.id, ids) : eq(vocabularyWords.active, true));
  if (!rows.length) return [];
  const wordIds = rows.map((r) => r.id);
  // Sequential on purpose: `db` may be a transaction client, which can't run queries concurrently.
  const syns = await db.select().from(wordSynonyms).where(inArray(wordSynonyms.wordId, wordIds));
  const ants = await db.select().from(wordAntonyms).where(inArray(wordAntonyms.wordId, wordIds));
  const group = (list: { wordId: string; value: string }[]) => {
    const m = new Map<string, string[]>();
    for (const r of list) m.set(r.wordId, [...(m.get(r.wordId) ?? []), r.value]);
    return m;
  };
  const s = group(syns);
  const a = group(ants);
  return rows.map((r) => ({
    id: r.id,
    word: r.word,
    meaning: r.meaning,
    example: r.example,
    relationNote: r.relationNote,
    category: r.category,
    difficulty: r.difficulty,
    synonyms: s.get(r.id) ?? [],
    antonyms: a.get(r.id) ?? [],
  }));
}
