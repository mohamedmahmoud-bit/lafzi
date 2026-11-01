/**
 * Word-pair boards (وصلها صح / ذاكرة لفظي). PURE: they only pair approved words with their approved
 * counterpart from the vocabulary list. No question text and no wrong options are composed — the
 * multiple-choice games use teacher-written questions only.
 */
import type { Lexicon, LexRelation } from "@/features/lexicon/content";
import { RELATION_CATEGORY, RELATION_TEXT, type RelationType } from "@/features/lexicon/mapping";
import { meaningKey } from "@/features/lexicon/normalize";
import { shuffle } from "@/lib/utils";
import type { Round } from "./types";

type Rand = () => number;
const lemma = (lx: Lexicon, id: string) => lx.entries.get(id)?.lemma ?? "";

/** Rights that are valid for a left word in a relation type. */
function rightsOf(lx: Lexicon, type: RelationType, fromId: string) {
  return new Set(lx.relations.filter((r) => r.type === type && r.fromId === fromId).map((r) => r.toId));
}

/**
 * Pick n relations of one type forming an UNAMBIGUOUS board: each left has exactly one right on the
 * board and no right fits two lefts (e.g. «جحر» fits الأرنب, الفأر and الأفعى → at most one of them).
 */
export function unambiguousSet(lx: Lexicon, type: RelationType, n: number, rand: Rand): LexRelation[] {
  const chosen: LexRelation[] = [];
  const usedRightKeys = new Set<string>();
  const usedLefts = new Set<string>();
  for (const r of shuffle(lx.relations.filter((x) => x.type === type), rand)) {
    if (chosen.length >= n) break;
    const rk = meaningKey(lemma(lx, r.toId));
    if (usedLefts.has(r.fromId) || usedRightKeys.has(rk)) continue;
    // r's right must not be valid for an already-chosen left, and chosen rights not valid for r's left.
    const conflict = chosen.some((c) => rightsOf(lx, type, c.fromId).has(r.toId) || rightsOf(lx, type, r.fromId).has(c.toId));
    if (conflict) continue;
    chosen.push(r);
    usedLefts.add(r.fromId);
    usedRightKeys.add(rk);
  }
  return chosen;
}

/** Relation types that have at least `n` relations usable on one board. */
export function playableTypes(lx: Lexicon, n: number, rand: Rand): RelationType[] {
  const types = [...new Set(lx.relations.map((r) => r.type))];
  return types.filter((t) => unambiguousSet(lx, t, n, rand).length >= n);
}

/** وصلها صح / ذاكرة لفظي: a board where every left must be connected to its one right. */
export function boardRounds(lx: Lexicon, type: RelationType, n: number, rand: Rand, kind: "match" | "memory"): Round[] {
  const set = unambiguousSet(lx, type, n, rand);
  if (set.length < n) return [];
  const rights = shuffle(set.map((r) => ({ id: r.toId, text: lemma(lx, r.toId) })), rand);
  return set.map((r) => ({
    kind,
    prompt: RELATION_TEXT[type].pairHint,
    questionId: null,
    versionId: null,
    noonQuestionId: null,
    subskillId: RELATION_CATEGORY[type],
    difficulty: lx.entries.get(r.fromId)?.difficulty ?? 2,
    stem: lemma(lx, r.fromId),
    passage: null,
    choices: rights,
    correctId: r.toId,
    explanation: r.example ? `مثال: ${r.example}` : null,
    relationshipId: r.id,
    entryIds: [r.fromId, r.toId],
    hintRemoved: null,
  }));
}

/** Category → the relation it is about (null = a meaning-only category such as مفردات القدرات). */
export function relationForCategory(category: string): RelationType | null {
  const hit = (Object.entries(RELATION_CATEGORY) as [RelationType, string][]).find(([, c]) => c === category);
  return hit ? hit[0] : null;
}

