import { createHash } from "node:crypto";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import type { Db, DbOrTx } from "@/db/client";
import {
  entryCategories,
  studentVocabularyProgress,
  vocabImportBatches,
  vocabImportRows,
  vocabularyEntries,
  vocabularyQuestionSources,
  vocabularyRelationships,
  wordSenses,
} from "@/db/schema";
import { parseCsvDataset, parseMarkdownDataset, type SourceRow } from "./dataset";
import { CATEGORY_DIFFICULTY, RELATION_CATEGORY, RELATION_LABEL, type RelationType } from "./mapping";
import { lexKey, meaningKey } from "./normalize";
import { summarize, validateRows } from "./validate";

export const DATASET_SOURCE_LABEL = "قائمة مفردات لفظي الأولية (مرفوعة من الفريق)";

/** Stage a dataset. Idempotent by file hash: re-importing the same file never duplicates rows. */
export async function importDataset(db: Db, p: { text: string; sourceName: string; format: "markdown" | "csv"; sourceKind?: string; createdBy?: string | null }) {
  const fileHash = createHash("sha256").update(p.text).digest("hex");
  const [existing] = await db.select().from(vocabImportBatches).where(eq(vocabImportBatches.fileHash, fileHash)).limit(1);
  if (existing) return { batch: existing, created: false };
  const parsed: SourceRow[] = p.format === "csv" ? parseCsvDataset(p.text) : parseMarkdownDataset(p.text);
  if (!parsed.length) throw new Error("لم يُعثر على أي صف في الملف");
  const rows = validateRows(parsed);
  return db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(vocabImportBatches)
      .values({ sourceName: p.sourceName, sourceKind: p.sourceKind ?? p.format, fileHash, rowCount: rows.length, stats: summarize(rows), createdBy: p.createdBy ?? null })
      .returning();
    for (let i = 0; i < rows.length; i += 200) {
      await tx.insert(vocabImportRows).values(
        rows.slice(i, i + 200).map((r) => ({
          batchId: batch.id,
          rowNumber: r.rowNumber,
          section: r.section,
          raw: r.raw,
          word: r.word,
          meaning: r.meaning,
          relationLabel: r.relationLabel,
          related: r.related,
          example: r.example,
          categoryId: r.categoryId,
          relationType: r.relationType,
          flags: r.flags,
          status: r.status,
        })),
      );
    }
    return { batch, created: true };
  });
}

async function upsertEntry(tx: DbOrTx, lemma: string, difficulty: number) {
  const normalized = lexKey(lemma);
  const [row] = await tx
    .insert(vocabularyEntries)
    .values({ lemma: lemma.trim(), normalized, status: "approved", difficulty })
    .onConflictDoUpdate({ target: vocabularyEntries.normalized, set: { updatedAt: new Date() } })
    .returning();
  // Follow merges so a merged duplicate never comes back.
  if (row.mergedInto) {
    const [target] = await tx.select().from(vocabularyEntries).where(eq(vocabularyEntries.id, row.mergedInto)).limit(1);
    if (target) return target;
  }
  if (row.status !== "approved" && row.status !== "suspended") {
    await tx.update(vocabularyEntries).set({ status: "approved" }).where(eq(vocabularyEntries.id, row.id));
  }
  return row;
}

async function addCategory(tx: DbOrTx, entryId: string, categoryId: string | null) {
  if (categoryId) await tx.insert(entryCategories).values({ entryId, categoryId }).onConflictDoNothing();
}

type Effective = { word: string; meaning: string | null; related: string | null; example: string | null; relationType: RelationType | null };

export function effectiveRow(r: typeof vocabImportRows.$inferSelect): Effective {
  const e = r.edited ?? {};
  const label = (e.relationLabel ?? r.relationLabel)?.trim() ?? null;
  const relationType = label && label in RELATION_LABEL ? RELATION_LABEL[label] : (r.relationType as RelationType | null);
  return {
    word: (e.word ?? r.word).trim(),
    meaning: e.meaning !== undefined ? e.meaning : r.meaning,
    related: e.related !== undefined ? e.related : r.related,
    example: e.example !== undefined ? e.example : r.example,
    relationType,
  };
}

/**
 * Reviewer approval of ONE source row: normalises it into a word, an approved sense (if it has a
 * meaning), categories, and a directional relationship (if any). The source row is never modified.
 */
export async function acceptRow(db: Db, rowId: string, reviewerId: string | null) {
  return db.transaction(async (tx) => {
    const [r] = await tx.select().from(vocabImportRows).where(eq(vocabImportRows.id, rowId)).for("update").limit(1);
    if (!r) throw new Error("Row not found");
    if (r.status === "accepted") return r;
    const e = effectiveRow(r);
    if (e.relationType && !e.related) throw new Error("لا يمكن الاعتماد: علاقة بلا كلمة مرتبطة");
    if (!e.relationType && !e.meaning) throw new Error("لا يمكن الاعتماد: لا يوجد معنى");
    const difficulty = CATEGORY_DIFFICULTY[r.categoryId ?? ""] ?? 2;
    const source = { kind: "dataset_row", label: DATASET_SOURCE_LABEL, batchId: r.batchId, rowNumber: r.rowNumber };

    const entry = await upsertEntry(tx, e.word, difficulty);
    await addCategory(tx, entry.id, r.categoryId);

    let senseId: string | null = null;
    if (e.meaning) {
      const senses = await tx.select().from(wordSenses).where(eq(wordSenses.entryId, entry.id));
      const same = senses.find((s) => meaningKey(s.meaning) === meaningKey(e.meaning!));
      if (same) {
        senseId = same.id;
        const sources = [...(same.sources as Record<string, unknown>[]).filter((x) => !(x.batchId === r.batchId && x.rowNumber === r.rowNumber)), source];
        await tx.update(wordSenses).set({ sources, status: "approved", example: same.example ?? e.example }).where(eq(wordSenses.id, same.id));
      } else {
        const [s] = await tx.insert(wordSenses).values({ entryId: entry.id, meaning: e.meaning, example: e.example, status: "approved", difficulty, sources: [source] }).returning({ id: wordSenses.id });
        senseId = s.id;
      }
    }

    let relatedEntryId: string | null = null;
    let relationshipId: string | null = null;
    if (e.relationType && e.related) {
      const related = await upsertEntry(tx, e.related, difficulty);
      relatedEntryId = related.id;
      await addCategory(tx, related.id, RELATION_CATEGORY[e.relationType]);
      const evidence = { ...source, kind: "dataset_row" };
      const [existing] = await tx
        .select()
        .from(vocabularyRelationships)
        .where(and(eq(vocabularyRelationships.fromEntryId, entry.id), eq(vocabularyRelationships.toEntryId, related.id), eq(vocabularyRelationships.type, e.relationType)))
        .limit(1);
      if (existing) {
        relationshipId = existing.id;
        const ev = [...(existing.evidence as Record<string, unknown>[]).filter((x) => !(x.batchId === r.batchId && x.rowNumber === r.rowNumber)), evidence];
        await tx.update(vocabularyRelationships).set({ evidence: ev, status: "approved", example: existing.example ?? e.example, updatedAt: new Date() }).where(eq(vocabularyRelationships.id, existing.id));
      } else {
        const [rel] = await tx
          .insert(vocabularyRelationships)
          .values({ fromEntryId: entry.id, toEntryId: related.id, type: e.relationType, status: "approved", evidence: [evidence], example: e.example })
          .returning({ id: vocabularyRelationships.id });
        relationshipId = rel.id;
      }
    }

    const [done] = await tx
      .update(vocabImportRows)
      .set({ status: "accepted", entryId: entry.id, relatedEntryId, senseId, relationshipId, reviewedBy: reviewerId, reviewedAt: new Date() })
      .where(eq(vocabImportRows.id, r.id))
      .returning();
    return done;
  });
}

/** Reviewer bulk action: approve every row that passed ALL automated checks and review notes. */
export async function acceptAllClean(db: Db, reviewerId: string | null, batchId?: string, limit?: number) {
  const rows = await db
    .select({ id: vocabImportRows.id })
    .from(vocabImportRows)
    .where(and(eq(vocabImportRows.status, "staged"), batchId ? eq(vocabImportRows.batchId, batchId) : undefined))
    .orderBy(vocabImportRows.rowNumber)
    .limit(limit ?? 100_000);
  let accepted = 0;
  for (const r of rows) {
    await acceptRow(db, r.id, reviewerId);
    accepted++;
  }
  return accepted;
}

export async function countClean(db: DbOrTx) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(vocabImportRows).where(eq(vocabImportRows.status, "staged"));
  return n;
}

export async function rejectRow(db: Db, rowId: string, reviewerId: string | null, note?: string) {
  await db.update(vocabImportRows).set({ status: "rejected", reviewedBy: reviewerId, reviewedAt: new Date(), note: note ?? null }).where(and(eq(vocabImportRows.id, rowId), ne(vocabImportRows.status, "accepted")));
}

/** Reviewer correction: stored beside the original (which is never overwritten). */
export async function editRow(db: Db, rowId: string, edited: Partial<Record<"word" | "meaning" | "related" | "example" | "relationLabel", string | null>>, note?: string) {
  const clean = Object.fromEntries(Object.entries(edited).map(([k, v]) => [k, v === undefined ? undefined : v?.trim() || null]).filter(([, v]) => v !== undefined));
  await db.update(vocabImportRows).set({ edited: clean, note: note ?? null }).where(and(eq(vocabImportRows.id, rowId), ne(vocabImportRows.status, "accepted")));
}

/** Merge a duplicate entry into another, keeping senses, relations, categories and student progress. */
export async function mergeEntries(db: Db, p: { sourceId: string; targetId: string }) {
  if (p.sourceId === p.targetId) throw new Error("Cannot merge an entry into itself");
  return db.transaction(async (tx) => {
    await tx.update(wordSenses).set({ entryId: p.targetId }).where(eq(wordSenses.entryId, p.sourceId));
    for (const c of await tx.select().from(entryCategories).where(eq(entryCategories.entryId, p.sourceId))) {
      await addCategory(tx, p.targetId, c.categoryId);
    }
    await tx.delete(entryCategories).where(eq(entryCategories.entryId, p.sourceId));
    for (const col of ["from", "to"] as const) {
      const rels = await tx.select().from(vocabularyRelationships).where(eq(col === "from" ? vocabularyRelationships.fromEntryId : vocabularyRelationships.toEntryId, p.sourceId));
      for (const r of rels) {
        const from = col === "from" ? p.targetId : r.fromEntryId;
        const to = col === "to" ? p.targetId : r.toEntryId;
        const [dup] = await tx.select().from(vocabularyRelationships).where(and(eq(vocabularyRelationships.fromEntryId, from), eq(vocabularyRelationships.toEntryId, to), eq(vocabularyRelationships.type, r.type))).limit(1);
        if (dup || from === to) {
          if (dup) await tx.update(vocabularyRelationships).set({ evidence: [...(dup.evidence as unknown[]), ...(r.evidence as unknown[])] as Record<string, unknown>[] }).where(eq(vocabularyRelationships.id, dup.id));
          await tx.delete(vocabularyRelationships).where(eq(vocabularyRelationships.id, r.id));
        } else {
          await tx.update(vocabularyRelationships).set({ fromEntryId: from, toEntryId: to }).where(eq(vocabularyRelationships.id, r.id));
        }
      }
    }
    // Student progress: keep the better record.
    const prog = await tx.select().from(studentVocabularyProgress).where(eq(studentVocabularyProgress.entryId, p.sourceId));
    for (const pr of prog) {
      const [t] = await tx.select().from(studentVocabularyProgress).where(and(eq(studentVocabularyProgress.userId, pr.userId), eq(studentVocabularyProgress.entryId, p.targetId))).limit(1);
      if (!t) await tx.update(studentVocabularyProgress).set({ entryId: p.targetId }).where(and(eq(studentVocabularyProgress.userId, pr.userId), eq(studentVocabularyProgress.entryId, p.sourceId)));
      else {
        if (pr.masteryScore > t.masteryScore) {
          await tx.update(studentVocabularyProgress).set({ box: pr.box, state: pr.state, masteryScore: pr.masteryScore, nextReviewAt: pr.nextReviewAt }).where(and(eq(studentVocabularyProgress.userId, pr.userId), eq(studentVocabularyProgress.entryId, p.targetId)));
        }
        await tx.delete(studentVocabularyProgress).where(and(eq(studentVocabularyProgress.userId, pr.userId), eq(studentVocabularyProgress.entryId, p.sourceId)));
      }
    }
    await tx.update(vocabularyQuestionSources).set({ entryId: p.targetId }).where(eq(vocabularyQuestionSources.entryId, p.sourceId)).catch(() => undefined);
    await tx.update(vocabImportRows).set({ entryId: p.targetId }).where(eq(vocabImportRows.entryId, p.sourceId));
    await tx.update(vocabImportRows).set({ relatedEntryId: p.targetId }).where(eq(vocabImportRows.relatedEntryId, p.sourceId));
    await tx.update(vocabularyEntries).set({ status: "rejected", mergedInto: p.targetId }).where(eq(vocabularyEntries.id, p.sourceId));
  });
}

export async function lexiconStats(db: DbOrTx) {
  const rows = await db.select({ s: vocabImportRows.status, n: sql<number>`count(*)::int` }).from(vocabImportRows).groupBy(vocabImportRows.status);
  const [{ words }] = await db.select({ words: sql<number>`count(*)::int` }).from(vocabularyEntries).where(and(eq(vocabularyEntries.status, "approved"), isNull(vocabularyEntries.mergedInto)));
  const [{ senses }] = await db.select({ senses: sql<number>`count(*)::int` }).from(wordSenses).where(eq(wordSenses.status, "approved"));
  const [{ relations }] = await db.select({ relations: sql<number>`count(*)::int` }).from(vocabularyRelationships).where(eq(vocabularyRelationships.status, "approved"));
  return { rows: Object.fromEntries(rows.map((r) => [r.s, r.n])) as Record<string, number>, words, senses, relations };
}

