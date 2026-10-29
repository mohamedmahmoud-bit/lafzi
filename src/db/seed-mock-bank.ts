/**
 * ⚠️ DEVELOPMENT ONLY. Loads the clearly-labelled MOCK question bank through the real pipeline
 * (sync → validate → review → publish → vocabulary extraction → review) so the games can be
 * exercised locally. Refuses to run in production.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "./client";
import * as s from "./schema";
import { MockQuestionBankProvider } from "../features/question-bank/providers";
import { decideQuestion } from "../features/question-bank/pipeline";
import { syncQuestionBank } from "../features/question-bank/sync.service";
import { decideRelationship, runVocabularyExtraction } from "../features/word-bank/service";

export const DEV_CHAPTERS = [2854, 2855, 2856, 2857, 2858, 2859, 5505];

export async function seedMockQuestionBank(db: Db, provider = new MockQuestionBankProvider()) {
  if (process.env.NODE_ENV === "production") throw new Error("Mock question bank is refused in production");
  const run = await syncQuestionBank(db, { provider, mode: "seed", chapters: DEV_CHAPTERS, isProduction: false });

  // Dev reviewer: publish every mock question that has no error-level failure.
  const candidates = await db
    .select({ id: s.noonQuestions.id })
    .from(s.noonQuestions)
    .where(and(eq(s.noonQuestions.isMock, true), inArray(s.noonQuestions.status, ["ready", "review_required"])));
  let published = 0;
  for (const q of candidates) {
    try {
      await decideQuestion(db, { questionId: q.id, decision: "approve", reviewerId: null, reason: "dev seed: mock auto-review", isProduction: false });
      published++;
    } catch {
      // stays in review — e.g. a mock item deliberately missing something
    }
  }

  await runVocabularyExtraction(db);
  const pending = await db.select({ id: s.vocabularyRelationships.id }).from(s.vocabularyRelationships).where(eq(s.vocabularyRelationships.status, "review_required"));
  let approved = 0;
  for (const r of pending) {
    try {
      await decideRelationship(db, { relationshipId: r.id, decision: "approve", reviewerId: null, reason: "dev seed: mock auto-review", isProduction: false });
      approved++;
    } catch {
      // left for manual review
    }
  }
  return { run, published, approvedRelations: approved };
}

/** Layout-only Study Hub cards, unmistakably labelled and never served in production. */
export async function seedDevStudyExamples(db: Db) {
  const examples = [
    { title: "مثال: ملخص علاقات التناظر", type: "pdf", topic: "verbal_analogy", sub: "st_1646" },
    { title: "مثال: أدوات الربط في إكمال الجمل", type: "slides", topic: "sentence_completion", sub: "st_1663" },
    { title: "مثال: فيديو شرح الخطأ السياقي", type: "video", topic: "contextual_error", sub: null },
    { title: "مثال: مسار استيعاب المقروء", type: "learning_path", topic: "reading_comprehension", sub: null },
  ];
  for (const e of examples) {
    const [r] = await db
      .insert(s.studyResources)
      .values({ title: e.title, description: "بطاقة مثال لعرض التصميم أثناء التطوير — لا يوجد ملف حقيقي.", resourceType: e.type, storageProvider: "dev_example", status: "draft", isDevExample: true })
      .returning({ id: s.studyResources.id });
    await db.insert(s.studyResourceTopics).values({ resourceId: r.id, topicId: e.topic });
    if (e.sub) await db.insert(s.studyResourceSubskills).values({ resourceId: r.id, subskillId: e.sub });
  }
}
