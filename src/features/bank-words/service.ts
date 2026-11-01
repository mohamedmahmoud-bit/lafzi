import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { bankWordCandidates, entryCategories, noonQuestions, noonQuestionVersions, readingPassages, vocabularyEntries, wordSenses } from "@/db/schema";
import { lexKey } from "@/features/lexicon/normalize";
import { vocalize } from "@/features/lexicon/tashkeel";
import type { NoonQuestion } from "@/features/question-bank/types";
import { extractCandidates, type BankText } from "./extract";

/** Re-scan every synced (non-archived) bank question and passage; upsert candidates. Idempotent. */
export async function refreshBankWords(db: DbOrTx) {
  // Score is recomputed every run; store it for ordering.
  const rows = await db
    .select({ noonId: noonQuestions.noonQuestionId, topic: noonQuestions.topicId, payload: noonQuestionVersions.payload, passage: readingPassages.body })
    .from(noonQuestions)
    .innerJoin(noonQuestionVersions, eq(noonQuestionVersions.id, noonQuestions.currentVersionId))
    .leftJoin(readingPassages, eq(readingPassages.id, noonQuestions.passageId))
    .where(and(ne(noonQuestions.status, "archived"), eq(noonQuestions.isMock, false)));
  const texts: BankText[] = rows.map((r) => {
    const p = r.payload as unknown as NoonQuestion;
    return { noonQuestionId: r.noonId, topic: r.topic, stem: p.stem, choices: p.choices.map((c) => c.text), passage: r.passage ?? p.reference?.body ?? null };
  });
  const known = new Set((await db.select({ n: vocabularyEntries.normalized }).from(vocabularyEntries).where(isNull(vocabularyEntries.mergedInto))).map((x) => x.n));
  const cands = extractCandidates(texts, known);
  for (let i = 0; i < cands.length; i += 300) {
    const chunk = cands.slice(i, i + 300);
    await db
      .insert(bankWordCandidates)
      .values(chunk.map((c) => ({ normalized: c.normalized, lemma: c.lemma, frequency: c.frequency, score: Math.round(c.score * 10), sources: c.sources })))
      .onConflictDoUpdate({
        target: bankWordCandidates.normalized,
        set: { frequency: sql`excluded.frequency`, score: sql`excluded.score`, sources: sql`excluded.sources`, updatedAt: new Date() },
      });
  }
  return { questions: texts.length, candidates: cands.length };
}

export async function listBankWords(db: DbOrTx, p: { status?: string; kind?: string; page?: number }) {
  const conds = [eq(bankWordCandidates.status, p.status ?? "candidate")];
  if (p.kind) conds.push(sql`${bankWordCandidates.sources}::text like ${`%"kind": "${p.kind}"%`}`);
  return db
    .select()
    .from(bankWordCandidates)
    .where(and(...conds))
    .orderBy(desc(bankWordCandidates.score), bankWordCandidates.frequency, bankWordCandidates.lemma)
    .limit(50)
    .offset(((p.page ?? 1) - 1) * 50);
}

/** Reviewer approves a bank word WITH the meaning they wrote (and optional example/category). */
export async function approveBankWord(db: DbOrTx, p: { id: string; lemma?: string; meaning: string; example?: string | null; categoryId?: string | null; reviewerId: string | null }) {
  const [c] = await db.select().from(bankWordCandidates).where(eq(bankWordCandidates.id, p.id)).limit(1);
  if (!c) throw new Error("الكلمة غير موجودة");
  const meaning = p.meaning.trim();
  if (meaning.length < 2) throw new Error("اكتب المعنى");
  // The reviewer may correct an inflected form to the dictionary form (e.g. يمقتون → يمقت).
  const lemma = vocalize((p.lemma?.trim() || c.lemma).normalize("NFC"));
  if (!/^[\u0621-\u064A\u064B-\u0652\u0670\s]+$/.test(lemma)) throw new Error("الكلمة يجب أن تكون عربية");
  const normalized = lexKey(lemma);
  const [entry] = await db
    .insert(vocabularyEntries)
    .values({ lemma, normalized, status: "approved", difficulty: 3 })
    .onConflictDoUpdate({ target: vocabularyEntries.normalized, set: { status: "approved", updatedAt: new Date() } })
    .returning();
  const source = { kind: "noon_bank_word", label: "كلمة من بنك نون — المعنى من المراجِع", noonQuestionIds: c.sources.map((s) => s.noonQuestionId), reviewerId: p.reviewerId };
  await db.insert(wordSenses).values({ entryId: entry.id, meaning, example: p.example?.trim() || null, status: "approved", difficulty: 3, sources: [source] });
  await db.insert(entryCategories).values({ entryId: entry.id, categoryId: p.categoryId || "vo_qudurat" }).onConflictDoNothing();
  await db.update(bankWordCandidates).set({ status: "approved", entryId: entry.id }).where(eq(bankWordCandidates.id, c.id));
  return entry.id;
}

export async function rejectBankWords(db: DbOrTx, ids: string[]) {
  if (ids.length) await db.update(bankWordCandidates).set({ status: "rejected" }).where(inArray(bankWordCandidates.id, ids));
}

export async function bankWordStats(db: DbOrTx) {
  const rows = await db.select({ s: bankWordCandidates.status, n: sql<number>`count(*)::int` }).from(bankWordCandidates).groupBy(bankWordCandidates.status);
  return Object.fromEntries(rows.map((r) => [r.s, r.n])) as Record<string, number>;
}
