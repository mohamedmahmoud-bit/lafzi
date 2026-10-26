import "server-only";
import { and, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
import { getDb, type Tx } from "@/db/client";
import { auditEvents, vocabularyWords, wordAntonyms, wordOfDay, wordSynonyms } from "@/db/schema";
import { WOD_NO_REPEAT_DAYS } from "@/features/daily-word/service";
import { loadWords } from "@/features/vocabulary/words.repo";
import { addDays } from "@/lib/time";
import { normalizeArabic } from "@/lib/utils";
import { audit } from "./audit";
import type { WordInput } from "./word-input";

export async function listWords(q?: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(vocabularyWords)
    .where(
      q
        ? or(ilike(vocabularyWords.word, `%${q}%`), ilike(vocabularyWords.meaning, `%${q}%`))
        : undefined,
    )
    .orderBy(desc(vocabularyWords.createdAt), vocabularyWords.word)
    .limit(300);
  return rows;
}

export async function getWordForEdit(id: string) {
  const [w] = await loadWords(getDb(), [id]);
  if (!w) return null;
  const [row] = await getDb()
    .select({ active: vocabularyWords.active })
    .from(vocabularyWords)
    .where(eq(vocabularyWords.id, id));
  return { ...w, active: row.active };
}

async function replaceLists(tx: Tx, wordId: string, input: WordInput) {
  await tx.delete(wordSynonyms).where(eq(wordSynonyms.wordId, wordId));
  await tx.delete(wordAntonyms).where(eq(wordAntonyms.wordId, wordId));
  if (input.synonyms.length)
    await tx.insert(wordSynonyms).values(input.synonyms.map((value) => ({ wordId, value })));
  if (input.antonyms.length)
    await tx.insert(wordAntonyms).values(input.antonyms.map((value) => ({ wordId, value })));
}

/** Create or update by normalized word (used by the form and CSV import). */
export async function upsertWord(
  actorId: string,
  input: WordInput,
  id?: string,
  tx?: Tx,
): Promise<{ id: string; created: boolean }> {
  const run = async (t: Tx) => {
    const normalizedWord = normalizeArabic(input.word);
    const values = {
      word: input.word,
      normalizedWord,
      meaning: input.meaning,
      example: input.example,
      relationNote: input.relationNote,
      difficulty: input.difficulty,
      category: input.category,
      active: input.active,
    };
    const [existing] = await t
      .select({ id: vocabularyWords.id })
      .from(vocabularyWords)
      .where(id ? eq(vocabularyWords.id, id) : eq(vocabularyWords.normalizedWord, normalizedWord))
      .limit(1);
    let wordId: string;
    if (existing) {
      await t.update(vocabularyWords).set(values).where(eq(vocabularyWords.id, existing.id));
      wordId = existing.id;
    } else {
      [{ id: wordId }] = await t
        .insert(vocabularyWords)
        .values(values)
        .returning({ id: vocabularyWords.id });
    }
    await replaceLists(t, wordId, input);
    await audit(
      {
        actorUserId: actorId,
        action: existing ? "word.update" : "word.create",
        entityType: "word",
        entityId: wordId,
        metadata: { word: input.word },
      },
      t,
    );
    return { id: wordId, created: !existing };
  };
  return tx ? run(tx) : getDb().transaction(run);
}

export async function setWordActive(actorId: string, id: string, active: boolean) {
  await getDb().transaction(async (tx) => {
    await tx.update(vocabularyWords).set({ active }).where(eq(vocabularyWords.id, id));
    await audit(
      {
        actorUserId: actorId,
        action: active ? "word.activate" : "word.deactivate",
        entityType: "word",
        entityId: id,
      },
      tx,
    );
  });
}

/** Word-of-the-day schedule for a window around today. */
export async function getWodSchedule(today: string) {
  const db = getDb();
  return db
    .select({
      day: wordOfDay.day,
      source: wordOfDay.source,
      word: vocabularyWords.word,
      wordId: wordOfDay.wordId,
    })
    .from(wordOfDay)
    .innerJoin(vocabularyWords, eq(vocabularyWords.id, wordOfDay.wordId))
    .where(and(gte(wordOfDay.day, addDays(today, -7)), lte(wordOfDay.day, addDays(today, 30))))
    .orderBy(wordOfDay.day);
}

export class WodScheduleError extends Error {
  constructor(
    public code: "word_not_found" | "recent_repeat" | "past_day",
    public detail?: string,
  ) {
    super(code);
  }
}

/** Manually schedule a word; refuses repeats inside the no-repeat window unless forced. */
export async function scheduleWod(
  actorId: string,
  day: string,
  wordText: string,
  today: string,
  force: boolean,
) {
  if (day < today) throw new WodScheduleError("past_day");
  const db = getDb();
  const [word] = await db
    .select({ id: vocabularyWords.id })
    .from(vocabularyWords)
    .where(
      and(
        eq(vocabularyWords.normalizedWord, normalizeArabic(wordText)),
        eq(vocabularyWords.active, true),
      ),
    )
    .limit(1);
  if (!word) throw new WodScheduleError("word_not_found");
  const [recent] = await db
    .select({ day: wordOfDay.day })
    .from(wordOfDay)
    .where(
      and(
        eq(wordOfDay.wordId, word.id),
        gte(wordOfDay.day, addDays(day, -WOD_NO_REPEAT_DAYS)),
        lte(wordOfDay.day, addDays(day, WOD_NO_REPEAT_DAYS)),
      ),
    )
    .limit(1);
  if (recent && recent.day !== day && !force)
    throw new WodScheduleError("recent_repeat", recent.day);
  await db.transaction(async (tx) => {
    await tx
      .insert(wordOfDay)
      .values({ day, wordId: word.id, source: "manual", createdBy: actorId })
      .onConflictDoUpdate({
        target: wordOfDay.day,
        set: { wordId: word.id, source: "manual", createdBy: actorId },
      });
    await audit(
      {
        actorUserId: actorId,
        action: "wod.schedule",
        entityType: "word_of_day",
        entityId: day,
        metadata: { word: wordText, force },
      },
      tx,
    );
  });
}

export async function clearWod(actorId: string, day: string, today: string) {
  if (day <= today) throw new WodScheduleError("past_day"); // today's word may already be in use
  await getDb().transaction(async (tx) => {
    await tx.delete(wordOfDay).where(eq(wordOfDay.day, day));
    await audit(
      { actorUserId: actorId, action: "wod.clear", entityType: "word_of_day", entityId: day },
      tx,
    );
  });
}

export async function recentAudit(limit = 100) {
  return getDb().select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(limit);
}
