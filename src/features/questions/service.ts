import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { Db, DbOrTx } from "@/db/client";
import { questionSets, teacherQuestions, verbalSubskills } from "@/db/schema";
import { meaningKey } from "@/features/lexicon/normalize";
import { SECTION_CATEGORY } from "@/features/lexicon/mapping";
import { answerIndex, parseQuestionCsv, parseQuestionMarkdown, type QuestionRow } from "./parse";

type Flag = { code: string; severity: "error" | "warning"; message: string };
const LETTERS = ["أ", "ب", "ج", "د"];

export function validateQuestions(rows: QuestionRow[], categoryOf: (section: string | null) => string | null) {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const flags: Flag[] = [];
    const add = (code: string, severity: Flag["severity"], message: string) => flags.push({ code, severity, message });
    if (r.options.length < 2) add("too_few_options", "error", "يجب أن يكون للسؤال خياران على الأقل");
    if (new Set(r.options.map(meaningKey)).size !== r.options.length) add("duplicate_options", "error", "خيارات مكررة");
    const ai = answerIndex(r.answer, r.options);
    if (!r.answer) add("missing_answer", "error", "لا توجد إجابة صحيحة");
    else if (ai < 0 || ai >= r.options.length) add("invalid_answer", "error", `الإجابة «${r.answer}» لا تطابق أي خيار`);
    const key = `${meaningKey(r.stem)}|${r.options.map(meaningKey).sort().join("|")}`;
    if (seen.has(key)) add("duplicate_question", "error", `مكرر للسؤال رقم ${seen.get(key)}`);
    else seen.set(key, r.rowNumber);
    const categoryId = categoryOf(r.section);
    if (r.section && !categoryId) add("unknown_section", "warning", `قسم غير معروف: «${r.section}» — سيظهر في كل الأقسام`);
    if (!r.explanation) add("no_explanation", "warning", "لا يوجد شرح (سيظهر الحل فقط)");
    const choices = r.options.map((text, i) => ({ id: LETTERS[i] ?? String(i + 1), text }));
    return {
      ...r,
      categoryId,
      choices,
      correctId: ai >= 0 && ai < choices.length ? choices[ai].id : null,
      flags,
      // Only errors block one-click approval; a missing explanation is fine.
      status: flags.some((f) => f.severity === "error") ? ("flagged" as const) : ("staged" as const),
    };
  });
}

export async function importQuestionSet(db: Db, p: { text: string; sourceName: string; format: "markdown" | "csv"; createdBy?: string | null }) {
  const fileHash = createHash("sha256").update(p.text).digest("hex");
  const [existing] = await db.select().from(questionSets).where(eq(questionSets.fileHash, fileHash)).limit(1);
  if (existing) return { set: existing, created: false };
  const parsed = p.format === "csv" ? parseQuestionCsv(p.text) : parseQuestionMarkdown(p.text);
  if (!parsed.length) throw new Error("لم يُعثر على أي سؤال في الملف (تحقق من عمود «السؤال»)");
  const subs = await db.select({ id: verbalSubskills.id, nameAr: verbalSubskills.nameAr }).from(verbalSubskills);
  const categoryOf = (section: string | null) => {
    if (!section) return null;
    const s = section.replace(/\(\s*\d+\s*\)/, "").trim();
    return SECTION_CATEGORY[s] ?? subs.find((x) => x.nameAr === s || x.id === s)?.id ?? null;
  };
  const rows = validateQuestions(parsed, categoryOf);
  const stats = { total: rows.length, clean: rows.filter((r) => r.status === "staged").length, flagged: rows.filter((r) => r.status === "flagged").length };
  return db.transaction(async (tx) => {
    const [set] = await tx.insert(questionSets).values({ sourceName: p.sourceName, fileHash, rowCount: rows.length, stats, createdBy: p.createdBy ?? null }).returning();
    for (let i = 0; i < rows.length; i += 200) {
      await tx.insert(teacherQuestions).values(
        rows.slice(i, i + 200).map((r) => ({
          setId: set.id,
          rowNumber: r.rowNumber,
          raw: r.raw,
          stem: r.stem,
          choices: r.choices,
          correctId: r.correctId,
          explanation: r.explanation,
          categoryId: r.categoryId,
          difficulty: r.difficulty ?? 2,
          status: r.status,
          flags: r.flags,
        })),
      );
    }
    return { set, created: true };
  });
}

export async function decideQuestion(db: DbOrTx, id: string, decision: "accepted" | "rejected", reviewerId: string | null) {
  const [q] = await db.select().from(teacherQuestions).where(eq(teacherQuestions.id, id)).limit(1);
  if (!q) throw new Error("السؤال غير موجود");
  if (decision === "accepted" && (!q.correctId || q.flags.some((f) => f.severity === "error"))) throw new Error("لا يمكن اعتماد سؤال فيه خطأ — صحّحه في الملف وأعد رفعه");
  await db.update(teacherQuestions).set({ status: decision, reviewedBy: reviewerId, reviewedAt: new Date() }).where(eq(teacherQuestions.id, id));
}

/** Reviewer bulk action in small batches (resumable). */
export async function acceptCleanQuestions(db: DbOrTx, reviewerId: string | null, limit = 200) {
  const rows = await db.select({ id: teacherQuestions.id }).from(teacherQuestions).where(eq(teacherQuestions.status, "staged")).limit(limit);
  if (!rows.length) return 0;
  await db
    .update(teacherQuestions)
    .set({ status: "accepted", reviewedBy: reviewerId, reviewedAt: new Date() })
    .where(and(eq(teacherQuestions.status, "staged"), sql`${teacherQuestions.id} in (${sql.join(rows.map((r) => sql`${r.id}::uuid`), sql`, `)})`));
  return rows.length;
}

export type TeacherQuestion = { id: string; stem: string; choices: { id: string; text: string }[]; correctId: string; explanation: string | null; categoryId: string | null; difficulty: number };

export async function publishedTeacherQuestions(db: DbOrTx, p: { categoryId?: string } = {}): Promise<TeacherQuestion[]> {
  const rows = await db
    .select()
    .from(teacherQuestions)
    .where(and(eq(teacherQuestions.status, "accepted"), p.categoryId ? eq(teacherQuestions.categoryId, p.categoryId) : undefined));
  return rows.filter((r) => r.correctId).map((r) => ({ id: r.id, stem: r.stem, choices: r.choices, correctId: r.correctId!, explanation: r.explanation, categoryId: r.categoryId, difficulty: r.difficulty }));
}

export async function questionStats(db: DbOrTx) {
  const rows = await db.select({ s: teacherQuestions.status, n: sql<number>`count(*)::int` }).from(teacherQuestions).groupBy(teacherQuestions.status);
  return Object.fromEntries(rows.map((r) => [r.s, r.n])) as Record<string, number>;
}
