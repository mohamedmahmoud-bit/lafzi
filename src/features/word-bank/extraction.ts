/**
 * Candidate extraction from official Noon questions. PURE and conservative:
 * it only SUGGESTS words and relationships; nothing here publishes anything.
 *
 * Evidence model — a relationship candidate is created only when Noon itself states the relation:
 *   • concept tag   — the question's curriculum concept is «الترادف» or «التضاد…» (Noon's classification)
 *   • explanation   — Noon's explanation says «العلاقة هنا هي: ترادف/تضاد»
 * Co-occurrence alone (two words in the same question) never creates a relationship.
 */
import { lexKey } from "@/features/lexicon/normalize";
import type { NoonQuestion } from "@/features/question-bank/types";

export type RelationType = "synonym" | "antonym";
export type EvidenceKind = "concept_tag" | "explanation_statement";

export type RelationCandidate = {
  from: { lemma: string; normalized: string };
  to: { lemma: string; normalized: string };
  type: RelationType;
  /** Where in the question the pair appears. */
  role: "stem" | "correct_choice";
  context: string;
  evidence: { kind: EvidenceKind; excerpt: string }[];
  /** Validation notes; a candidate with any failed check is never queued for approval. */
  checks: { check: string; passed: boolean; message: string }[];
};

const MOCK_LABEL = /^\(تجريبي\)\s*/;
const PAIR = /^\s*([^:：]+?)\s*[:：]\s*([^:：]+?)\s*$/;
const ARABIC_WORD = /^[ء-ي٠-٩ً-ْٰـ ]+$/;
/** Only Noon's headline statement about the question's relation — never a line about a distractor. */
const EXPLANATION_RELATION = /العلاقة\s+هنا\s+هي\s*[:：]\s*(ترادف|تضاد)/;

export function relationFromConcept(conceptName: string | null): RelationType | null {
  if (!conceptName) return null;
  if (conceptName.includes("الترادف")) return "synonym";
  if (conceptName.includes("التضاد")) return "antonym";
  return null;
}

export function relationFromExplanation(explanation: string | null): { type: RelationType; excerpt: string } | null {
  const m = explanation?.match(EXPLANATION_RELATION);
  if (!m) return null;
  return { type: m[1] === "ترادف" ? "synonym" : "antonym", excerpt: m[0] };
}

function parsePair(s: string) {
  const m = s.replace(MOCK_LABEL, "").match(PAIR);
  if (!m) return null;
  const words = [m[1].trim(), m[2].trim()];
  return words.map((w) => ({ lemma: w, normalized: lexKey(w) }));
}

function wordChecks(w: { lemma: string; normalized: string }) {
  return [
    { check: "arabic_only", passed: ARABIC_WORD.test(w.lemma), message: `«${w.lemma}» is Arabic text only` },
    { check: "single_term", passed: w.lemma.split(/\s+/).length <= 2 && w.normalized.length >= 2, message: `«${w.lemma}» is a single word or short term` },
  ];
}

/**
 * Extract relationship candidates from one analogy question. Returns [] unless Noon's own
 * classification states a synonym/antonym relation.
 */
export function extractCandidates(q: NoonQuestion): RelationCandidate[] {
  if (q.correctChoiceIds.length !== 1) return [];
  const conceptRelations = [...new Set(q.curriculum.map((c) => relationFromConcept(c.conceptName)).filter((x): x is RelationType => !!x))];
  const stated = relationFromExplanation(q.explanation);
  if (!conceptRelations.length && !stated) return [];

  const type: RelationType = conceptRelations[0] ?? stated!.type;
  const conflict = (conceptRelations.length > 1) || (stated && conceptRelations.length && stated.type !== conceptRelations[0]);

  const evidence: RelationCandidate["evidence"] = [];
  const concept = q.curriculum.find((c) => relationFromConcept(c.conceptName) === type)?.conceptName;
  if (concept) evidence.push({ kind: "concept_tag", excerpt: concept });
  if (stated && stated.type === type) evidence.push({ kind: "explanation_statement", excerpt: stated.excerpt });

  const correct = q.choices.find((c) => c.id === q.correctChoiceIds[0]);
  const sources: { role: RelationCandidate["role"]; text: string }[] = [{ role: "stem", text: q.stem }];
  if (correct) sources.push({ role: "correct_choice", text: correct.text });

  const out: RelationCandidate[] = [];
  for (const s of sources) {
    const pair = parsePair(s.text);
    if (!pair) continue;
    const [from, to] = pair;
    out.push({
      from,
      to,
      type,
      role: s.role,
      context: s.text.replace(MOCK_LABEL, ""),
      evidence,
      checks: [
        ...wordChecks(from),
        ...wordChecks(to),
        { check: "distinct_words", passed: from.normalized !== to.normalized, message: "The two words differ" },
        { check: "no_conflict", passed: !conflict, message: conflict ? "Noon's tag and explanation disagree" : "Tag and explanation agree" },
        { check: "noon_stated", passed: evidence.length > 0, message: "Relation stated by Noon (tag or explanation)" },
      ],
    });
  }
  return out;
}

/** Corroborated = both Noon signals agree. Weaker evidence still needs (and gets) human review. */
export const isCorroborated = (c: Pick<RelationCandidate, "evidence">) =>
  c.evidence.some((e) => e.kind === "concept_tag") && c.evidence.some((e) => e.kind === "explanation_statement");

/** A relationship may be approved only with at least one Noon-stated evidence item. */
export function canApproveRelationship(evidence: { kind: string }[]): boolean {
  return evidence.some((e) => NOON_EVIDENCE.has(e.kind) || OTHER_EVIDENCE.has(e.kind));
}

/** Evidence that depends on a live Noon question version. */
export const NOON_EVIDENCE = new Set(["concept_tag", "explanation_statement", "explanation_quote"]);
/** Human-reviewed sources that do not depend on the question bank (dataset row, reference, admin). */
export const OTHER_EVIDENCE = new Set(["dataset_row", "reference", "admin"]);

/** A meaning may be approved only if it is quoted verbatim from a source question's Noon explanation. */
const fold = (s: string) =>
  s.normalize("NFC").replace(/[\u064B-\u0652\u0670\u0640]/g, "").replace(/[إأآٱ]/g, "ا").replace(/ى/g, "ي").replace(/\s+/g, " ").trim();

export function meaningSupported(quote: string, explanation: string | null): boolean {
  const q = fold(quote);
  return q.length >= 3 && !!explanation && fold(explanation).includes(q);
}
