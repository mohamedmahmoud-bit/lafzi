"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import {
  noonIntegrationVerifications,
  noonPracticeDestinations,
  noonSkillMappings,
  studyResources,
  studyResourceSubskills,
  studyResourceTopics,
  studyResourceVersions,
} from "@/db/schema";
import { assertAdmin } from "@/features/auth/dal";
import { getTaxonomy } from "@/features/curriculum/service";
import { checkDestinationUrl, VERIFICATION_SCENARIOS } from "@/features/noon-practice/policy";
import { allowedHosts, refreshVerificationStatus } from "@/features/noon-practice/service";
import { beginImport, finishImport, importBatch, publishAllReady } from "@/features/question-bank/import.service";
import { decideQuestion } from "@/features/question-bank/pipeline";
import type { NoonQuestionDTO } from "@/features/question-bank/types";
import { runQuestionBankSync } from "@/features/question-bank/run-sync";
import { isResourceType } from "@/features/study/providers";
import { approveCorroborated, approveMeaning, decideEntry, decideRelationship, runVocabularyExtraction } from "@/features/word-bank/service";
import { isProduction } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sanitizeText } from "@/lib/utils";
import { audit } from "./audit";

export type ActionState = { ok?: boolean; message?: string } | null;
const fail = (e: unknown): ActionState => ({ ok: false, message: (e as Error).message });

// ─── Question bank ──────────────────────────────────────────────────────────

export async function syncNowAction(): Promise<ActionState> {
  const admin = await assertAdmin();
  await enforceRateLimit(`qb_sync:${admin.id}`, 6, 600);
  try {
    const { run } = await runQuestionBankSync("manual", admin.id);
    await audit({ actorUserId: admin.id, action: "question_bank.sync", entityType: "question_sync_run", entityId: run.id, metadata: { status: run.status } });
    revalidatePath("/admin/question-bank");
    return { ok: run.status === "succeeded", message: `${run.status}${run.error ? ` — ${run.error.split("\n")[0]}` : ""}` };
  } catch (e) {
    return fail(e);
  }
}

export async function decideQuestionAction(form: FormData) {
  const admin = await assertAdmin();
  const questionId = z.uuid().parse(form.get("questionId"));
  const decision = z.enum(["approve", "reject", "archive", "request_review"]).parse(form.get("decision"));
  const reason = sanitizeText(String(form.get("reason") ?? ""), 300) || undefined;
  await decideQuestion(getDb(), { questionId, decision, reviewerId: admin.id, reason, isProduction: isProduction() });
  await audit({ actorUserId: admin.id, action: `question.${decision}`, entityType: "noon_question", entityId: questionId, metadata: { reason } });
  if (decision === "approve") await runVocabularyExtraction(getDb());
  revalidatePath(`/admin/question-bank/${questionId}`);
  revalidatePath("/admin/question-bank");
}

// ─── Import of an authorised Noon export (batched from the browser) ─────────

const dtoSchema = z
  .object({ id: z.number().int().positive(), text: z.string().nullable().optional(), choices: z.array(z.object({ id: z.union([z.number(), z.string()]) }).passthrough()).optional() })
  .passthrough();

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
/** Admin-only: return the real error text instead of React's opaque production error. */
async function guarded<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    console.error("[admin import]", e);
    const err = e as { issues?: { path: unknown[]; message: string }[]; message?: string };
    const msg = err.issues ? err.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : (err.message ?? String(e));
    return { ok: false, error: msg.slice(0, 500) };
  }
}

export async function beginImportAction(p: { chapters: number[]; total: number; fileNames: string[] }) {
  return guarded(async () => {
    const admin = await assertAdmin();
    const chapters = z.array(z.number().int().positive()).max(20).parse(p.chapters);
    const runId = await beginImport(getDb(), { chapters, total: z.number().int().min(1).max(50000).parse(p.total), triggeredBy: admin.id, fileNames: z.array(z.string().max(120)).max(20).parse(p.fileNames) });
    await audit({ actorUserId: admin.id, action: "question_bank.import_start", entityType: "question_sync_run", entityId: runId, metadata: { chapters, total: p.total, files: p.fileNames } });
    return runId;
  });
}

export async function importBatchAction(runId: string, items: unknown[]) {
  return guarded(async () => {
    await assertAdmin();
    const parsed = z.array(dtoSchema).min(1).max(100).parse(items) as unknown as NoonQuestionDTO[];
    return importBatch(getDb(), z.uuid().parse(runId), parsed, isProduction());
  });
}

export async function finishImportAction(runId: string, p: { chapters: number[]; seenIds: number[]; complete: boolean }) {
  return guarded(async () => {
    const admin = await assertAdmin();
    const run = await finishImport(getDb(), z.uuid().parse(runId), {
      chapters: z.array(z.number().int().positive()).parse(p.chapters),
      seenIds: z.array(z.number().int().positive()).max(50000).parse(p.seenIds),
      complete: p.complete === true,
    });
    await audit({ actorUserId: admin.id, action: "question_bank.import_finish", entityType: "question_sync_run", entityId: runId, metadata: run.stats });
    revalidatePath("/admin/question-bank");
    return { status: run.status, stats: run.stats };
  });
}

export async function publishAllReadyAction(): Promise<ActionState> {
  const admin = await assertAdmin();
  try {
    const n = await publishAllReady(getDb(), { reviewerId: admin.id, isProduction: isProduction() });
    await audit({ actorUserId: admin.id, action: "question.bulk_publish_ready", metadata: { count: n } });
    const vocab = await runVocabularyExtraction(getDb());
    revalidatePath("/admin/question-bank");
    return { ok: true, message: `نُشر ${n} سؤالًا اجتازت كل الفحوص. مرشحات مفردات: ${vocab.candidates}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function approveCorroboratedAction(): Promise<void> {
  const admin = await assertAdmin();
  try {
    const n = await approveCorroborated(getDb(), { reviewerId: admin.id, isProduction: isProduction() });
    await audit({ actorUserId: admin.id, action: "vocab.bulk_approve_corroborated", metadata: { count: n } });
  } catch (e) {
    console.error("[vocab bulk approve]", e);
  }
  revalidatePath("/admin/vocabulary");
}

// ─── Vocabulary review ──────────────────────────────────────────────────────

export async function decideRelationshipAction(form: FormData): Promise<void> {
  const admin = await assertAdmin();
  const relationshipId = z.uuid().parse(form.get("id"));
  const decision = z.enum(["approve", "reject"]).parse(form.get("decision"));
  await decideRelationship(getDb(), { relationshipId, decision, reviewerId: admin.id, isProduction: isProduction() });
  await audit({ actorUserId: admin.id, action: `vocab_relationship.${decision}`, entityType: "vocabulary_relationship", entityId: relationshipId });
  revalidatePath("/admin/vocabulary");
}

export async function decideEntryAction(form: FormData): Promise<void> {
  const admin = await assertAdmin();
  const entryId = z.uuid().parse(form.get("id"));
  const decision = z.enum(["approve", "reject", "suspend"]).parse(form.get("decision"));
  await decideEntry(getDb(), { entryId, decision, reviewerId: admin.id, isProduction: isProduction() });
  await audit({ actorUserId: admin.id, action: `vocab_entry.${decision}`, entityType: "vocabulary_entry", entityId: entryId });
  revalidatePath("/admin/vocabulary");
}

export async function approveMeaningAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const admin = await assertAdmin();
  try {
    const entryId = z.uuid().parse(form.get("entryId"));
    const questionId = z.uuid().parse(form.get("questionId"));
    const quote = sanitizeText(String(form.get("quote") ?? ""), 300);
    await approveMeaning(getDb(), { entryId, questionId, quote, reviewerId: admin.id });
    await audit({ actorUserId: admin.id, action: "vocab_entry.approve_meaning", entityType: "vocabulary_entry", entityId: entryId });
    revalidatePath("/admin/vocabulary");
    return { ok: true, message: "تم اعتماد المعنى." };
  } catch (e) {
    return fail(e);
  }
}

export async function rerunExtractionAction() {
  const admin = await assertAdmin();
  const r = await runVocabularyExtraction(getDb());
  await audit({ actorUserId: admin.id, action: "vocab.extract", metadata: r });
  revalidatePath("/admin/vocabulary");
}

// ─── Noon practice integration ──────────────────────────────────────────────

export async function saveMappingAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const admin = await assertAdmin();
  try {
    const tax = await getTaxonomy();
    const topic = tax.topic(String(form.get("topicId")));
    if (!topic) throw new Error("Unknown topic");
    const sub = form.get("subskillId") ? tax.subskill(String(form.get("subskillId"))) : null;
    if (form.get("subskillId") && (!sub || sub.topicId !== topic.id)) throw new Error("Subskill does not belong to topic");
    const num = (k: string) => (form.get(k) ? z.coerce.number().int().positive().parse(form.get(k)) : null);
    const values = {
      topicId: topic.id,
      subskillId: sub?.id ?? null,
      noonChapterId: num("noonChapterId"),
      noonTopicId: num("noonTopicId"),
      noonSubtopicId: num("noonSubtopicId"),
      noonConceptId: num("noonConceptId"),
      noonLabel: sanitizeText(String(form.get("noonLabel") ?? ""), 120) || null,
      notes: sanitizeText(String(form.get("notes") ?? ""), 500) || null,
      updatedBy: admin.id,
    };
    const db = getDb();
    const [existing] = await db
      .select({ id: noonSkillMappings.id })
      .from(noonSkillMappings)
      .where(and(eq(noonSkillMappings.topicId, topic.id), sub ? eq(noonSkillMappings.subskillId, sub.id) : isNull(noonSkillMappings.subskillId)))
      .limit(1);
    if (existing) await db.update(noonSkillMappings).set(values).where(eq(noonSkillMappings.id, existing.id));
    else await db.insert(noonSkillMappings).values(values);
    await audit({ actorUserId: admin.id, action: "noon_mapping.save", entityType: "noon_skill_mapping", metadata: values });
    revalidatePath("/admin/integrations/noon");
    return { ok: true, message: "تم الحفظ." };
  } catch (e) {
    return fail(e);
  }
}

export async function addDestinationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const admin = await assertAdmin();
  try {
    const kind = z.enum(["skill_practice", "heatmap", "general_practice"]).parse(form.get("kind"));
    const platform = z.enum(["web", "mobile_web", "app", "any"]).parse(form.get("platform"));
    const url = String(form.get("url") ?? "").trim();
    const check = checkDestinationUrl(url, allowedHosts());
    if (!check.ok) throw new Error(`Refused: ${check.reason}`);
    const mappingId = form.get("mappingId") ? z.uuid().parse(form.get("mappingId")) : null;
    if (kind === "skill_practice" && !mappingId) throw new Error("A skill destination needs a mapping");
    const expiresAt = form.get("expiresAt") ? new Date(String(form.get("expiresAt"))) : null;
    const [d] = await getDb()
      .insert(noonPracticeDestinations)
      .values({ kind, platform, url, mappingId, expiresAt, notes: sanitizeText(String(form.get("notes") ?? ""), 300) || null, createdBy: admin.id, verificationStatus: "unverified" })
      .returning({ id: noonPracticeDestinations.id });
    await audit({ actorUserId: admin.id, action: "noon_destination.add", entityType: "noon_practice_destination", entityId: d.id, metadata: { kind, platform, host: new URL(url).host } });
    revalidatePath("/admin/integrations/noon");
    return { ok: true, message: "أضيفت الوجهة — غير متحقق منها حتى تسجّل اختبار «طالب مسجّل على الكمبيوتر» ناجحًا." };
  } catch (e) {
    return fail(e);
  }
}

export async function recordVerificationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const admin = await assertAdmin();
  try {
    const destinationId = z.uuid().parse(form.get("destinationId"));
    const scenario = z.enum(VERIFICATION_SCENARIOS).parse(form.get("scenario"));
    const result = z.enum(["pass", "fail", "partial"]).parse(form.get("result"));
    const observedLanding = sanitizeText(String(form.get("observedLanding") ?? ""), 300);
    if (observedLanding.length < 3) throw new Error("Describe where the test actually landed");
    const db = getDb();
    await db.insert(noonIntegrationVerifications).values({ destinationId, scenario, result, observedLanding, notes: sanitizeText(String(form.get("notes") ?? ""), 300) || null, verifiedBy: admin.id });
    const status = await refreshVerificationStatus(db, destinationId);
    await audit({ actorUserId: admin.id, action: "noon_destination.verify", entityType: "noon_practice_destination", entityId: destinationId, metadata: { scenario, result, status } });
    revalidatePath("/admin/integrations/noon");
    return { ok: true, message: `الحالة الآن: ${status}` };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteDestinationAction(form: FormData) {
  const admin = await assertAdmin();
  const id = z.uuid().parse(form.get("id"));
  await getDb().delete(noonPracticeDestinations).where(eq(noonPracticeDestinations.id, id));
  await audit({ actorUserId: admin.id, action: "noon_destination.delete", entityType: "noon_practice_destination", entityId: id });
  revalidatePath("/admin/integrations/noon");
}

// ─── Study resources ────────────────────────────────────────────────────────

export async function saveResourceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const admin = await assertAdmin();
  try {
    const title = sanitizeText(String(form.get("title") ?? ""), 140);
    if (title.length < 3) throw new Error("Title required");
    const type = String(form.get("resourceType"));
    if (!isResourceType(type)) throw new Error("Unknown type");
    const locator = String(form.get("locator") ?? "").trim() || null;
    if (locator && !/^https:\/\//.test(locator)) throw new Error("Use an https:// link");
    const status = z.enum(["draft", "published"]).parse(form.get("status"));
    if (status === "published" && !locator) throw new Error("A published resource needs a link");
    const tax = await getTaxonomy();
    const topic = tax.topic(String(form.get("topicId") ?? ""));
    const sub = form.get("subskillId") ? tax.subskill(String(form.get("subskillId"))) : null;
    if (!topic) throw new Error("Choose a topic");
    const db = getDb();
    await db.transaction(async (tx) => {
      const [r] = await tx
        .insert(studyResources)
        .values({ title, description: sanitizeText(String(form.get("description") ?? ""), 600), resourceType: type, storageProvider: "url", locator, status })
        .returning({ id: studyResources.id });
      const [v] = await tx.insert(studyResourceVersions).values({ resourceId: r.id, version: 1, locator }).returning({ id: studyResourceVersions.id });
      await tx.update(studyResources).set({ currentVersionId: v.id }).where(eq(studyResources.id, r.id));
      await tx.insert(studyResourceTopics).values({ resourceId: r.id, topicId: topic.id });
      if (sub && sub.topicId === topic.id) await tx.insert(studyResourceSubskills).values({ resourceId: r.id, subskillId: sub.id });
      await audit({ actorUserId: admin.id, action: "study_resource.create", entityType: "study_resource", entityId: r.id }, tx);
    });
    revalidatePath("/admin/study");
    revalidatePath("/study");
    return { ok: true, message: "تم الحفظ." };
  } catch (e) {
    return fail(e);
  }
}

export async function setResourceStatusAction(form: FormData) {
  const admin = await assertAdmin();
  const id = z.uuid().parse(form.get("id"));
  const status = z.enum(["draft", "published", "archived"]).parse(form.get("status"));
  const [r] = await getDb().select().from(studyResources).where(eq(studyResources.id, id)).limit(1);
  if (!r || r.isDevExample || (status === "published" && !r.locator)) return;
  await getDb().update(studyResources).set({ status }).where(eq(studyResources.id, id));
  await audit({ actorUserId: admin.id, action: `study_resource.${status}`, entityType: "study_resource", entityId: id });
  revalidatePath("/admin/study");
}
