import { createHash } from "node:crypto";
import type { NoonQuestion, NoonQuestionDTO } from "./types";

const ENTITIES: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };

/** Noon stores explanations/passages as HTML. Convert to plain text (paragraphs → lines); never render raw HTML. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h\d)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? " ")
    .replace(/[ \t ]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n")
    .normalize("NFC");
}

/** Stems/options sometimes carry stray markup (<br>, &nbsp;) — strip it, never change the words. */
const clean = (s: string | null | undefined) => htmlToText(s).replace(/\s+/g, " ").trim().normalize("NFC");

export function normalizeDTO(dto: NoonQuestionDTO): NoonQuestion {
  const materials = dto.additionalMaterials ?? [];
  const explanation = materials.filter((m) => m.type === "explanation").map((m) => htmlToText(m.content)).filter(Boolean).join("\n");
  const ref = materials.find((m) => m.type === "reference" && htmlToText(m.content));
  const correct = [...new Set([...(dto.correctChoiceIds ?? []), ...(dto.correctChoiceId != null ? [dto.correctChoiceId] : [])].map(String))];
  return {
    noonQuestionId: Number(dto.id),
    type: dto.type ?? "unknown",
    stem: clean(dto.text),
    choices: (dto.choices ?? []).map((c) => ({ id: String(c.id), text: clean(c.text), hasMedia: !!c.url })),
    correctChoiceIds: correct.sort(),
    isMultiSelect: !!dto.isMultiSelect,
    shuffleChoices: !!dto.shuffleChoices,
    explanation: explanation || null,
    reference: ref ? { noonReferenceId: Number(ref.id), body: htmlToText(ref.content) } : null,
    difficulty: dto.difficultyLevel ?? null,
    curriculum: (dto.curriculum ?? []).map((c) => ({
      subjectId: c.subjectId ?? null,
      chapterId: c.chapterId ?? null,
      topicId: c.topicId ?? null,
      subtopicId: c.subtopicId ?? null,
      conceptId: c.conceptId ?? null,
      chapterName: c.chapter?.name ?? null,
      subtopicName: c.subtopic?.name ?? null,
      conceptName: c.concept?.name ?? null,
    })),
    suitableForPractice: dto.suitableForPractice ?? null,
    reportStatus: dto.reportStatus ?? null,
    examPaperIds: [...(dto.examPaperIds ?? [])].sort((a, b) => a - b),
    createdAt: dto.createdAt ? new Date(dto.createdAt).toISOString() : null,
  };
}

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Any change in what we store. */
export const contentHash = (q: NoonQuestion) => sha(stable(q));
/** Changes that can alter whether a student's answer is right (suspend a published question). */
export const correctnessHash = (q: NoonQuestion) =>
  sha(stable({ stem: q.stem, choices: q.choices, correct: q.correctChoiceIds, ref: q.reference?.body ?? null }));

/** Normalised text used for duplicate detection. */
export const dedupeKey = (q: NoonQuestion) =>
  sha(stable({ s: q.stem.replace(/[ً-ْ\s]/g, ""), c: q.choices.map((c) => c.text.replace(/[ً-ْ\s]/g, "")).sort() }));
