import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import {
  noonQuestions,
  noonQuestionVersions,
  questionGameCompatibility,
  questionPassageLinks,
  questionReviewDecisions,
  questionSkillMappings,
  questionValidationResults,
  readingPassages,
  verbalSubskills,
  verbalTopics,
} from "@/db/schema";
import { NOON_VERBAL_SUBJECT_ID } from "@/features/curriculum/noon-verbal-curriculum";
import { nativeModesForTopic, PLAYABLE_TOPICS } from "@/features/games/modes";
import { contentHash } from "./normalize";
import type { NoonQuestion } from "./types";
import { validateQuestion, type ValidationOutcome } from "./validation";

export type PipelineResult = { status: string; outcome: ValidationOutcome; suspended: boolean };

async function taxonomyLookups(db: DbOrTx) {
  const topics = await db.select({ id: verbalTopics.id, chapter: verbalTopics.noonChapterId }).from(verbalTopics);
  const subskills = await db.select({ id: verbalSubskills.id, subtopic: verbalSubskills.noonSubtopicId }).from(verbalSubskills);
  return {
    topicForChapter: (c: number) => topics.find((t) => t.chapter === c)?.id ?? null,
    subskillForSubtopic: (s: number) => subskills.find((x) => x.subtopic === s)?.id ?? null,
  };
}

/**
 * Validate a question's current version and move it through the workflow:
 * IMPORTED → VALIDATING → READY | REVIEW_REQUIRED | REJECTED. Publishing is always a separate decision.
 * A published question whose correctness changed is suspended (never silently re-served).
 */
export async function runPipeline(db: DbOrTx, questionId: string, opts: { isProduction: boolean }): Promise<PipelineResult> {
  const [q] = await db.select().from(noonQuestions).where(eq(noonQuestions.id, questionId)).limit(1);
  if (!q?.currentVersionId) throw new Error("Question has no version");
  const [v] = await db.select().from(noonQuestionVersions).where(eq(noonQuestionVersions.id, q.currentVersionId)).limit(1);
  const payload = v.payload as unknown as NoonQuestion;
  await db.update(noonQuestions).set({ status: "validating" }).where(eq(noonQuestions.id, q.id));

  // Exact duplicate = another live question whose current version has the same correctness hash.
  const [dup] = await db
    .select({ noonId: noonQuestions.noonQuestionId })
    .from(noonQuestions)
    .innerJoin(noonQuestionVersions, eq(noonQuestionVersions.id, noonQuestions.currentVersionId))
    .where(and(eq(noonQuestionVersions.correctnessHash, v.correctnessHash), ne(noonQuestions.id, q.id), ne(noonQuestions.status, "archived")))
    .limit(1);

  const lookups = await taxonomyLookups(db);
  const res = validateQuestion(payload, {
    ...lookups,
    playableTopics: PLAYABLE_TOPICS,
    duplicateOf: dup?.noonId ?? null,
    isMock: q.isMock,
    isProduction: opts.isProduction,
    verbalSubjectId: NOON_VERBAL_SUBJECT_ID,
  });

  await db.delete(questionValidationResults).where(eq(questionValidationResults.versionId, v.id));
  await db.insert(questionValidationResults).values(res.results.map((r) => ({ versionId: v.id, ...r })));

  // Reading passage: shared by Noon reference id.
  let passageId: string | null = null;
  if (payload.reference) {
    const body = payload.reference.body;
    const hash = contentHash({ ...payload, stem: body, choices: [], correctChoiceIds: [] });
    const [p] = await db
      .insert(readingPassages)
      .values({ noonReferenceId: payload.reference.noonReferenceId, body, contentHash: hash })
      .onConflictDoUpdate({ target: readingPassages.noonReferenceId, set: { body, contentHash: hash } })
      .returning({ id: readingPassages.id });
    passageId = p.id;
    await db.delete(questionPassageLinks).where(eq(questionPassageLinks.questionId, q.id));
    await db.insert(questionPassageLinks).values({ questionId: q.id, passageId }).onConflictDoNothing();
  }

  // Noon's tag is a proposal; publishing approves it after the content-shape checks.
  await db
    .insert(questionSkillMappings)
    .values({ questionId: q.id, source: "noon_tag", topicId: res.topicId, subskillId: res.subskillId, status: "proposed" })
    .onConflictDoUpdate({
      target: [questionSkillMappings.questionId, questionSkillMappings.source],
      set: { topicId: res.topicId, subskillId: res.subskillId },
    });
  for (const mode of res.topicId ? nativeModesForTopic(res.topicId) : []) {
    await db
      .insert(questionGameCompatibility)
      .values({ questionId: q.id, gameMode: mode, basis: "native", status: "proposed" })
      .onConflictDoNothing();
  }

  let status: typeof q.status = res.outcome;
  let publishedVersionId: string | null = null;
  let reason: string | null = res.outcome === "ready" ? null : res.results.filter((r) => !r.passed && r.severity !== "info").map((r) => r.check).join(", ");
  let suspended = false;

  if (q.status === "published" && q.publishedVersionId) {
    const [pub] = await db.select().from(noonQuestionVersions).where(eq(noonQuestionVersions.id, q.publishedVersionId)).limit(1);
    if (pub && pub.correctnessHash === v.correctnessHash && res.outcome === "ready") {
      status = "published"; // e.g. explanation edited — keep serving, now on the new version
      publishedVersionId = v.id;
    } else {
      suspended = true;
      status = res.outcome === "rejected" ? "rejected" : "review_required";
      reason = pub?.correctnessHash !== v.correctnessHash
        ? "Suspended: Noon changed the question, options or answer — needs review before students see it again"
        : `Suspended after revalidation: ${reason}`;
    }
  }

  await db
    .update(noonQuestions)
    .set({
      status,
      publishedVersionId,
      topicId: res.topicId,
      subskillId: res.subskillId,
      difficulty: payload.difficulty,
      passageId,
      statusReason: reason,
    })
    .where(eq(noonQuestions.id, q.id));

  return { status, outcome: res.outcome, suspended };
}

export type ReviewDecision = "approve" | "reject" | "archive" | "request_review";

/**
 * Human decision. "approve" publishes the CURRENT version — refused while any error-level check fails.
 * Warnings may be accepted by a reviewer (that is what review means).
 */
export async function decideQuestion(
  db: DbOrTx,
  p: { questionId: string; decision: ReviewDecision; reviewerId: string | null; reason?: string; isProduction: boolean },
) {
  const [q] = await db.select().from(noonQuestions).where(eq(noonQuestions.id, p.questionId)).limit(1);
  if (!q?.currentVersionId) throw new Error("Question not found");
  if (p.decision === "approve") {
    if (q.isMock && p.isProduction) throw new Error("Mock questions cannot be published in production");
    if (q.removedAt) throw new Error("Question was removed from the Noon bank");
    const [{ errors }] = await db
      .select({ errors: sql<number>`count(*)::int` })
      .from(questionValidationResults)
      .where(and(eq(questionValidationResults.versionId, q.currentVersionId), eq(questionValidationResults.passed, false), eq(questionValidationResults.severity, "error")));
    if (errors > 0 || q.status === "rejected") throw new Error("Cannot publish: failed validation checks");
    if (!q.topicId) throw new Error("Cannot publish: no topic mapping");
    await db.update(noonQuestions).set({ status: "published", publishedVersionId: q.currentVersionId, statusReason: null }).where(eq(noonQuestions.id, q.id));
    await db.update(questionSkillMappings).set({ status: "approved", decidedBy: p.reviewerId }).where(and(eq(questionSkillMappings.questionId, q.id), eq(questionSkillMappings.source, "noon_tag")));
    await db.update(questionGameCompatibility).set({ status: "approved", decidedBy: p.reviewerId }).where(and(eq(questionGameCompatibility.questionId, q.id), eq(questionGameCompatibility.basis, "native")));
  } else {
    const status = p.decision === "reject" ? "rejected" : p.decision === "archive" ? "archived" : "review_required";
    await db.update(noonQuestions).set({ status, publishedVersionId: null, statusReason: p.reason ?? null }).where(eq(noonQuestions.id, q.id));
  }
  await db.insert(questionReviewDecisions).values({
    questionId: q.id,
    versionId: q.currentVersionId,
    decision: p.decision,
    reason: p.reason ?? null,
    reviewerId: p.reviewerId,
  });
}

export async function latestVersionNumber(db: DbOrTx, questionId: string) {
  const [v] = await db
    .select({ version: noonQuestionVersions.version })
    .from(noonQuestionVersions)
    .where(eq(noonQuestionVersions.questionId, questionId))
    .orderBy(desc(noonQuestionVersions.version))
    .limit(1);
  return v?.version ?? 0;
}
