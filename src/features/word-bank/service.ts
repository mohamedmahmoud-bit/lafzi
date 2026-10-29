import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import {
  noonQuestions,
  noonQuestionVersions,
  vocabularyEntries,
  vocabularyQuestionSources,
  vocabularyRelationships,
  vocabularyReviewDecisions,
  vocabularyValidationRecords,
} from "@/db/schema";
import type { NoonQuestion } from "@/features/question-bank/types";
import { canApproveRelationship, extractCandidates, isCorroborated, meaningSupported } from "./extraction";

export type Evidence = { questionId: string; noonQuestionId: number; versionId: string; kind: string; excerpt: string; role: string };

async function upsertEntry(db: DbOrTx, w: { lemma: string; normalized: string }, isMock: boolean) {
  const [row] = await db
    .insert(vocabularyEntries)
    .values({ lemma: w.lemma, normalized: w.normalized, status: "candidate", isMock })
    .onConflictDoUpdate({ target: vocabularyEntries.normalized, set: { updatedAt: new Date() } })
    .returning({ id: vocabularyEntries.id, status: vocabularyEntries.status });
  return row;
}

/**
 * Extract candidates from ONE published question version and queue them for human review.
 * Idempotent: re-running adds no duplicate sources or evidence.
 */
export async function extractFromQuestion(db: DbOrTx, questionId: string) {
  const [q] = await db
    .select({ id: noonQuestions.id, noonId: noonQuestions.noonQuestionId, status: noonQuestions.status, versionId: noonQuestions.publishedVersionId, isMock: noonQuestions.isMock, topicId: noonQuestions.topicId })
    .from(noonQuestions)
    .where(eq(noonQuestions.id, questionId))
    .limit(1);
  if (!q || q.status !== "published" || !q.versionId || q.topicId !== "verbal_analogy") return { candidates: 0 };
  const [v] = await db.select({ payload: noonQuestionVersions.payload }).from(noonQuestionVersions).where(eq(noonQuestionVersions.id, q.versionId)).limit(1);
  const payload = v.payload as unknown as NoonQuestion;
  const candidates = extractCandidates(payload);

  for (const c of candidates) {
    const from = await upsertEntry(db, c.from, q.isMock);
    const to = await upsertEntry(db, c.to, q.isMock);
    for (const entry of [from, to]) {
      await db
        .insert(vocabularyQuestionSources)
        .values({ entryId: entry.id, questionId: q.id, questionVersionId: q.versionId, role: c.role, context: c.context })
        .onConflictDoUpdate({
          target: [vocabularyQuestionSources.entryId, vocabularyQuestionSources.questionId, vocabularyQuestionSources.role],
          set: { questionVersionId: q.versionId, context: c.context },
        });
      if (entry.status === "candidate") {
        await db.update(vocabularyEntries).set({ status: "review_required" }).where(and(eq(vocabularyEntries.id, entry.id), eq(vocabularyEntries.status, "candidate")));
      }
    }

    const allPassed = c.checks.every((x) => x.passed);
    const newEvidence: Evidence[] = c.evidence.map((e) => ({ questionId: q.id, noonQuestionId: q.noonId, versionId: q.versionId!, kind: e.kind, excerpt: e.excerpt, role: c.role }));
    const [existing] = await db
      .select()
      .from(vocabularyRelationships)
      .where(and(eq(vocabularyRelationships.fromEntryId, from.id), eq(vocabularyRelationships.toEntryId, to.id), eq(vocabularyRelationships.type, c.type)))
      .limit(1);
    const merged = [
      ...((existing?.evidence ?? []) as Evidence[]).filter((e) => e.questionId !== q.id),
      ...newEvidence,
    ];
    const status = existing && (existing.status === "approved" || existing.status === "rejected")
      ? existing.status
      : allPassed ? "review_required" : "candidate";
    const [rel] = existing
      ? await db.update(vocabularyRelationships).set({ evidence: merged, status, updatedAt: new Date() }).where(eq(vocabularyRelationships.id, existing.id)).returning()
      : await db.insert(vocabularyRelationships).values({ fromEntryId: from.id, toEntryId: to.id, type: c.type, status, evidence: merged }).returning();

    await db.delete(vocabularyValidationRecords).where(eq(vocabularyValidationRecords.relationshipId, rel.id));
    await db.insert(vocabularyValidationRecords).values([
      ...c.checks.map((x) => ({ relationshipId: rel.id, check: x.check, passed: x.passed, message: x.message })),
      { relationshipId: rel.id, check: "corroborated", passed: isCorroborated(c), message: isCorroborated(c) ? "Noon tag and explanation both state the relation" : "Single Noon signal — reviewer must confirm" },
    ]);
  }
  return { candidates: candidates.length };
}

/** Run extraction over every published analogy question (after each sync). */
export async function runVocabularyExtraction(db: DbOrTx) {
  const qs = await db
    .select({ id: noonQuestions.id })
    .from(noonQuestions)
    .where(and(eq(noonQuestions.status, "published"), eq(noonQuestions.topicId, "verbal_analogy")));
  let candidates = 0;
  for (const q of qs) candidates += (await extractFromQuestion(db, q.id)).candidates;
  const reassessed = await reassessVocabulary(db);
  return { questions: qs.length, candidates, ...reassessed };
}

/**
 * Re-check approved vocabulary against its sources. Evidence from a question that is no longer
 * published on the SAME version is invalid; with no valid evidence left the item is suspended.
 */
export async function reassessVocabulary(db: DbOrTx) {
  const live = await db
    .select({ id: noonQuestions.id, versionId: noonQuestions.publishedVersionId })
    .from(noonQuestions)
    .where(eq(noonQuestions.status, "published"));
  const liveVersion = new Map(live.map((l) => [l.id, l.versionId]));
  const valid = (e: Evidence) => liveVersion.get(e.questionId) === e.versionId;

  let suspended = 0;
  const rels = await db.select().from(vocabularyRelationships).where(inArray(vocabularyRelationships.status, ["approved", "review_required"]));
  for (const r of rels) {
    const ev = (r.evidence as Evidence[]).filter(valid);
    if (!canApproveRelationship(ev)) {
      await db.update(vocabularyRelationships).set({ status: "suspended", updatedAt: new Date() }).where(eq(vocabularyRelationships.id, r.id));
      await db.insert(vocabularyReviewDecisions).values({ relationshipId: r.id, decision: "suspend", reason: "Source Noon question changed or was removed", reviewerId: null });
      suspended++;
    }
  }

  // Entries: need at least one source question still published.
  const entries = await db.select({ id: vocabularyEntries.id, meaningEvidence: vocabularyEntries.meaningEvidence, meaningStatus: vocabularyEntries.meaningStatus }).from(vocabularyEntries).where(eq(vocabularyEntries.status, "approved"));
  for (const e of entries) {
    const srcs = await db.select().from(vocabularyQuestionSources).where(eq(vocabularyQuestionSources.entryId, e.id));
    const ok = srcs.some((s) => liveVersion.has(s.questionId));
    if (!ok) {
      await db.update(vocabularyEntries).set({ status: "suspended" }).where(eq(vocabularyEntries.id, e.id));
      await db.insert(vocabularyReviewDecisions).values({ entryId: e.id, decision: "suspend", reason: "No published Noon source question", reviewerId: null });
      suspended++;
    } else if (e.meaningStatus === "approved" && !(e.meaningEvidence as Evidence[]).some(valid)) {
      await db.update(vocabularyEntries).set({ meaningStatus: "proposed" }).where(eq(vocabularyEntries.id, e.id));
      suspended++;
    }
  }
  return { suspended };
}

export async function decideRelationship(db: DbOrTx, p: { relationshipId: string; decision: "approve" | "reject"; reviewerId: string | null; reason?: string; isProduction: boolean }) {
  const [r] = await db.select().from(vocabularyRelationships).where(eq(vocabularyRelationships.id, p.relationshipId)).limit(1);
  if (!r) throw new Error("Relationship not found");
  if (p.decision === "approve") {
    const failed = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(vocabularyValidationRecords)
      .where(and(eq(vocabularyValidationRecords.relationshipId, r.id), eq(vocabularyValidationRecords.passed, false), ne(vocabularyValidationRecords.check, "corroborated")));
    if (failed[0].n > 0) throw new Error("Cannot approve: failed validation checks");
    if (!canApproveRelationship(r.evidence as Evidence[])) throw new Error("Cannot approve: no Noon-stated evidence");
    const ents = await db.select().from(vocabularyEntries).where(inArray(vocabularyEntries.id, [r.fromEntryId, r.toEntryId]));
    if (p.isProduction && ents.some((e) => e.isMock)) throw new Error("Mock vocabulary cannot be approved in production");
    // Approving a relationship confirms both words as reviewed, Noon-sourced vocabulary.
    await db.update(vocabularyEntries).set({ status: "approved" }).where(and(inArray(vocabularyEntries.id, [r.fromEntryId, r.toEntryId]), inArray(vocabularyEntries.status, ["candidate", "review_required"])));
  }
  await db.update(vocabularyRelationships).set({ status: p.decision === "approve" ? "approved" : "rejected", updatedAt: new Date() }).where(eq(vocabularyRelationships.id, r.id));
  await db.insert(vocabularyReviewDecisions).values({ relationshipId: r.id, decision: p.decision, reason: p.reason ?? null, reviewerId: p.reviewerId });
}

export async function decideEntry(db: DbOrTx, p: { entryId: string; decision: "approve" | "reject" | "suspend"; reviewerId: string | null; reason?: string; isProduction: boolean }) {
  const [e] = await db.select().from(vocabularyEntries).where(eq(vocabularyEntries.id, p.entryId)).limit(1);
  if (!e) throw new Error("Entry not found");
  if (p.decision === "approve") {
    if (p.isProduction && e.isMock) throw new Error("Mock vocabulary cannot be approved in production");
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(vocabularyQuestionSources).where(eq(vocabularyQuestionSources.entryId, e.id));
    if (n === 0) throw new Error("Cannot approve: no Noon source question");
  }
  const status = p.decision === "approve" ? "approved" : p.decision === "reject" ? "rejected" : "suspended";
  await db.update(vocabularyEntries).set({ status }).where(eq(vocabularyEntries.id, e.id));
  await db.insert(vocabularyReviewDecisions).values({ entryId: e.id, decision: p.decision, reason: p.reason ?? null, reviewerId: p.reviewerId });
}

/**
 * Approve a meaning ONLY as a verbatim quote from a source question's Noon explanation.
 * No free-text definitions — this is enforced, not a convention.
 */
export async function approveMeaning(db: DbOrTx, p: { entryId: string; questionId: string; quote: string; reviewerId: string | null }) {
  const [src] = await db
    .select({ versionId: noonQuestions.publishedVersionId, noonId: noonQuestions.noonQuestionId })
    .from(vocabularyQuestionSources)
    .innerJoin(noonQuestions, eq(noonQuestions.id, vocabularyQuestionSources.questionId))
    .where(and(eq(vocabularyQuestionSources.entryId, p.entryId), eq(vocabularyQuestionSources.questionId, p.questionId), eq(noonQuestions.status, "published")))
    .limit(1);
  if (!src?.versionId) throw new Error("Not a published source question of this word");
  const [v] = await db.select({ payload: noonQuestionVersions.payload }).from(noonQuestionVersions).where(eq(noonQuestionVersions.id, src.versionId)).limit(1);
  const explanation = (v.payload as unknown as NoonQuestion).explanation;
  if (!meaningSupported(p.quote, explanation)) throw new Error("The meaning must be quoted from the Noon explanation of this question");
  const evidence: Evidence = { questionId: p.questionId, noonQuestionId: src.noonId, versionId: src.versionId, kind: "explanation_quote", excerpt: p.quote.trim(), role: "explanation" };
  await db.update(vocabularyEntries).set({ meaning: p.quote.trim(), meaningStatus: "approved", meaningEvidence: [evidence] }).where(eq(vocabularyEntries.id, p.entryId));
  await db.insert(vocabularyReviewDecisions).values({ entryId: p.entryId, decision: "approve_meaning", reason: p.quote.trim(), reviewerId: p.reviewerId });
}

export type ApprovedRelation = {
  id: string;
  type: "synonym" | "antonym";
  from: { id: string; lemma: string };
  to: { id: string; lemma: string };
  evidence: Evidence[];
};

/** The approved repository — the ONLY vocabulary students ever see. */
export async function approvedRelations(db: DbOrTx, opts: { isProduction: boolean }): Promise<ApprovedRelation[]> {
  const rels = await db.select().from(vocabularyRelationships).where(eq(vocabularyRelationships.status, "approved"));
  if (!rels.length) return [];
  const ids = [...new Set(rels.flatMap((r) => [r.fromEntryId, r.toEntryId]))];
  const ents = new Map((await db.select().from(vocabularyEntries).where(and(inArray(vocabularyEntries.id, ids), eq(vocabularyEntries.status, "approved")))).map((e) => [e.id, e]));
  return rels
    .filter((r) => ents.has(r.fromEntryId) && ents.has(r.toEntryId))
    .filter((r) => !opts.isProduction || (!ents.get(r.fromEntryId)!.isMock && !ents.get(r.toEntryId)!.isMock))
    .map((r) => ({
      id: r.id,
      type: r.type as "synonym" | "antonym",
      from: { id: r.fromEntryId, lemma: ents.get(r.fromEntryId)!.lemma },
      to: { id: r.toEntryId, lemma: ents.get(r.toEntryId)!.lemma },
      evidence: r.evidence as Evidence[],
    }));
}
