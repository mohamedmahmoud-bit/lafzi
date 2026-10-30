import type { NoonQuestion } from "./types";

export type CheckSeverity = "error" | "warning" | "info";
export type CheckResult = { check: string; passed: boolean; severity: CheckSeverity; message: string };
export type ValidationOutcome = "ready" | "review_required" | "rejected";

export type ValidationContext = {
  /** Noon chapter id → canonical topic id. */
  topicForChapter: (chapterId: number) => string | null;
  /** Noon subtopic id → canonical subskill id. */
  subskillForSubtopic: (subtopicId: number) => string | null;
  /** Topics that currently have a game able to play MCQ questions. */
  playableTopics: Set<string>;
  /** Another Noon question with the same normalised stem + choices, if any. */
  duplicateOf: number | null;
  isMock: boolean;
  isProduction: boolean;
  verbalSubjectId: number;
};

const ARABIC = /[؀-ۿ]/;
const BROKEN = /�|Ã|Ø§|Ù„/; // replacement chars / UTF-8 mojibake
const HTML_LEFTOVER = /<\/?[a-z][^>]*>/i;
const BLANK = /(\.{3,}|…|_{2,}|ـ{2,}|-{3,})/;
const PAIR = /^[^:：]+[:：][^:：]+$/;

/**
 * Validate one normalised Noon question. Pure: same input → same result.
 * Any error → rejected; any warning → human review; otherwise ready (publishing is still a decision).
 */
export function validateQuestion(q: NoonQuestion, ctx: ValidationContext): {
  outcome: ValidationOutcome;
  results: CheckResult[];
  topicId: string | null;
  subskillId: string | null;
} {
  const r: CheckResult[] = [];
  const add = (check: string, passed: boolean, severity: CheckSeverity, message: string) =>
    r.push({ check, passed, severity: passed ? "info" : severity, message });

  add("source_id", Number.isInteger(q.noonQuestionId) && q.noonQuestionId > 0, "error", "Official Noon Question ID");
  add("mock_in_production", !(ctx.isMock && ctx.isProduction), "error", "Mock questions are never allowed in production");
  add("type_supported", q.type === "mcq", "error", `Question type "${q.type}" — only single-answer MCQ is playable without an approved transformation`);
  add("single_answer", !q.isMultiSelect, "error", "Multi-select questions are not supported by current games");
  add("stem_present", q.stem.length > 0, "error", "Question text present");

  const texts = q.choices.map((c) => c.text);
  add("choices_count", q.choices.length >= 2 && q.choices.length <= 6, "error", `Answer options: ${q.choices.length}`);
  add("choices_non_empty", q.choices.every((c) => c.text.length > 0 || c.hasMedia), "error", "Every option has text");
  add("choices_unique", new Set(texts).size === texts.length, "error", "Options are distinct");
  add("choices_text_only", q.choices.every((c) => !c.hasMedia), "warning", "Options with images need review (not rendered yet)");

  const ids = new Set(q.choices.map((c) => c.id));
  add("correct_answer", q.correctChoiceIds.length === 1 && ids.has(q.correctChoiceIds[0]), "error", "Exactly one correct option that exists");

  const all = [q.stem, ...texts, q.reference?.body ?? ""].join(" ");
  add("arabic_text", ARABIC.test(all), "error", "Contains Arabic text");
  add("text_integrity", !BROKEN.test(all) && !HTML_LEFTOVER.test(all), "error", "No broken characters or leftover HTML");

  add("difficulty", q.difficulty !== null && q.difficulty >= 1 && q.difficulty <= 5, "warning", `Difficulty ${q.difficulty ?? "missing"}`);
  add("suitable_for_practice", q.suitableForPractice === true, "error", "Noon marks the question suitable for practice");
  add("no_open_reports", !q.reportStatus || q.reportStatus === "RESOLVED", "warning", `Report status: ${q.reportStatus ?? "none"}`);
  add("explanation", q.explanation !== null, "info", q.explanation ? "Noon explanation available" : "No explanation in the bank (shown as unavailable)");

  // Curriculum classification (Noon tags) — necessary but not sufficient.
  const tags = q.curriculum.filter((c) => c.subjectId === ctx.verbalSubjectId);
  const chapters = [...new Set(tags.map((t) => t.chapterId).filter((x): x is number => x !== null))];
  add("verbal_subject", tags.length > 0, "error", "Tagged to the verbal subject");
  add("single_chapter", chapters.length <= 1, "warning", `Tagged to ${chapters.length} chapters`);
  const topicId = chapters.length === 1 ? ctx.topicForChapter(chapters[0]) : null;
  add("topic_mapped", topicId !== null, "warning", topicId ? `Topic: ${topicId}` : "Chapter not in the canonical taxonomy");
  const subtopics = [...new Set(tags.map((t) => t.subtopicId).filter((x): x is number => x !== null))];
  const subskillId = subtopics.length === 1 ? ctx.subskillForSubtopic(subtopics[0]) : null;
  if (subtopics.length === 0) {
    // Noon tagged it at topic level only: playable, tracked at topic level (not a data problem).
    add("subskill_mapped", false, "info", "No subtopic in Noon's tags — tracked at topic level");
  } else {
    add("subskill_mapped", subskillId !== null, "warning", subskillId ? `Subskill: ${subskillId}` : "Subtopic ambiguous or not in the taxonomy");
  }

  // Content-shape checks per topic: don't trust the tag alone.
  if (topicId === "verbal_analogy") {
    add("analogy_shape", PAIR.test(q.stem) && texts.every((t) => PAIR.test(t)), "warning", "Analogy stem and options are «كلمة : كلمة» pairs");
  }
  if (topicId === "sentence_completion") {
    add("completion_blank", BLANK.test(q.stem), "warning", "Sentence contains a blank to complete");
  }
  if (topicId === "contextual_error") {
    add("error_word_in_sentence", texts.every((t) => q.stem.includes(t)), "warning", "Every option is a word from the sentence");
  }
  if (topicId === "reading_comprehension") {
    add("passage_dependency", !!q.reference?.body, "error", "Linked reading passage present");
  }

  add("not_duplicate", ctx.duplicateOf === null, "warning", ctx.duplicateOf ? `Same content as Noon question ${ctx.duplicateOf}` : "Unique");
  add("game_compatible", topicId !== null && ctx.playableTopics.has(topicId), "info", topicId && ctx.playableTopics.has(topicId) ? "A live game can play it" : "No live game for this topic yet");

  const failed = r.filter((x) => !x.passed);
  const outcome: ValidationOutcome = failed.some((x) => x.severity === "error")
    ? "rejected"
    : failed.some((x) => x.severity === "warning")
      ? "review_required"
      : "ready";
  return { outcome, results: r, topicId, subskillId };
}
