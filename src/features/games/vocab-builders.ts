/**
 * Round builders for the vocabulary games. PURE: they only rearrange approved content
 * (approved meanings, approved relationships). No text is generated; no distractor is invented —
 * every wrong option is another approved meaning/word, checked to be unambiguously wrong.
 */
import type { Lexicon, LexRelation } from "@/features/lexicon/content";
import { GROUP_NAME, GROUPABLE, RELATION_CATEGORY, RELATION_TEXT, type RelationType } from "@/features/lexicon/mapping";
import { meaningKey } from "@/features/lexicon/normalize";
import { shuffle } from "@/lib/utils";
import type { Round } from "./types";

type Rand = () => number;
const lemma = (lx: Lexicon, id: string) => lx.entries.get(id)?.lemma ?? "";

/** Entries linked to `id` by synonym (either direction) — their meanings can't be distractors. */
function synonymsOf(lx: Lexicon, id: string) {
  const out = new Set<string>([id]);
  for (const r of lx.relations) {
    if (r.type !== "synonym") continue;
    if (r.fromId === id) out.add(r.toId);
    if (r.toId === id) out.add(r.fromId);
  }
  return out;
}

const primaryCategory = (lx: Lexicon, entryId: string) => lx.entries.get(entryId)?.categories[0] ?? "vo_qudurat";

/** صائد المعاني: word → its approved meaning among 4 approved meanings of other words. */
export function meaningRounds(lx: Lexicon, p: { n: number; rand: Rand; category?: string; preferEntries?: string[] }): Round[] {
  let pool = lx.senses.filter((s) => !p.category || lx.entries.get(s.entryId)?.categories.includes(p.category));
  // One sense per entry per session; due/weak words first when given.
  const byEntry = new Map<string, (typeof pool)[number]>();
  for (const s of shuffle(pool, p.rand)) if (!byEntry.has(s.entryId)) byEntry.set(s.entryId, s);
  pool = [...byEntry.values()];
  const prefer = new Set(p.preferEntries ?? []);
  pool.sort((a, b) => Number(prefer.has(b.entryId)) - Number(prefer.has(a.entryId)));
  const out: Round[] = [];
  for (const s of pool) {
    if (out.length >= p.n) break;
    const excluded = synonymsOf(lx, s.entryId);
    const ownMeanings = new Set(lx.senses.filter((x) => x.entryId === s.entryId).map((x) => meaningKey(x.meaning)));
    const sameCat = primaryCategory(lx, s.entryId);
    const candidates = shuffle(
      lx.senses.filter((d) => !excluded.has(d.entryId) && !ownMeanings.has(meaningKey(d.meaning)) && meaningKey(d.meaning) !== meaningKey(s.meaning)),
      p.rand,
    ).sort((a, b) => Number(primaryCategory(lx, b.entryId) === sameCat) - Number(primaryCategory(lx, a.entryId) === sameCat));
    const distractors: typeof candidates = [];
    for (const d of candidates) {
      if (distractors.length >= 3) break;
      if (!distractors.some((x) => meaningKey(x.meaning) === meaningKey(d.meaning))) distractors.push(d);
    }
    if (distractors.length < 3) continue;
    const choices = shuffle([s, ...distractors], p.rand).map((x) => ({ id: x.id, text: x.meaning }));
    out.push({
      kind: "meaning",
      prompt: "ما معنى الكلمة؟",
      questionId: null,
      versionId: null,
      noonQuestionId: null,
      subskillId: sameCat,
      difficulty: s.difficulty,
      stem: lemma(lx, s.entryId),
      passage: null,
      choices,
      correctId: s.id,
      explanation: s.example ? `مثال: ${s.example}` : null,
      entryIds: [s.entryId],
      hintRemoved: null,
    });
  }
  return out;
}

/** Rights that are valid for a left word in a relation type. */
function rightsOf(lx: Lexicon, type: RelationType, fromId: string) {
  return new Set(lx.relations.filter((r) => r.type === type && r.fromId === fromId).map((r) => r.toId));
}

/** One relation question: "ما صوت الأسد؟" with 3 other approved answers of the same type that are NOT valid for this word. */
export function relationRound(lx: Lexicon, rel: LexRelation, rand: Rand): Round | null {
  const valid = rightsOf(lx, rel.type, rel.fromId);
  const validKeys = new Set([...valid].map((id) => meaningKey(lemma(lx, id))));
  const others = shuffle(
    [...new Set(lx.relations.filter((r) => r.type === rel.type && !valid.has(r.toId)).map((r) => r.toId))].filter((id) => !validKeys.has(meaningKey(lemma(lx, id)))),
    rand,
  );
  const distractors: string[] = [];
  for (const id of others) {
    if (distractors.length >= 3) break;
    if (!distractors.some((d) => meaningKey(lemma(lx, d)) === meaningKey(lemma(lx, id)))) distractors.push(id);
  }
  if (distractors.length < 2) return null;
  const choices = shuffle([rel.toId, ...distractors], rand).map((id) => ({ id, text: lemma(lx, id) }));
  return {
    kind: "relation",
    prompt: RELATION_TEXT[rel.type].ask(lemma(lx, rel.fromId)),
    questionId: null,
    versionId: null,
    noonQuestionId: null,
    subskillId: RELATION_CATEGORY[rel.type],
    difficulty: lx.entries.get(rel.fromId)?.difficulty ?? 2,
    stem: lemma(lx, rel.fromId),
    passage: null,
    choices,
    correctId: rel.toId,
    explanation: rel.example ? `مثال: ${rel.example}` : null,
    relationshipId: rel.id,
    entryIds: [rel.fromId, rel.toId],
    hintRemoved: null,
  };
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

/**
 * الكلمة الدخيلة: three answers of one relation type + one of another, where the outlier is never
 * an answer of the majority type and no majority item is an answer of the outlier's type.
 */
export function oddOneOutRound(lx: Lexicon, rand: Rand): Round | null {
  const types = shuffle(GROUPABLE.filter((t) => lx.relations.some((r) => r.type === t)), rand);
  for (const a of types) {
    const rightsA = new Set(lx.relations.filter((r) => r.type === a).map((r) => meaningKey(lemma(lx, r.toId))));
    const groupA = unambiguousSet(lx, a, 3, rand);
    if (groupA.length < 3) continue;
    for (const b of types.filter((t) => t !== a)) {
      const rightsB = new Set(lx.relations.filter((r) => r.type === b).map((r) => meaningKey(lemma(lx, r.toId))));
      if (groupA.some((g) => rightsB.has(meaningKey(lemma(lx, g.toId))))) continue;
      const odd = shuffle(lx.relations.filter((r) => r.type === b && !rightsA.has(meaningKey(lemma(lx, r.toId)))), rand)[0];
      if (!odd) continue;
      const items = shuffle([...groupA.map((g) => g.toId), odd.toId], rand).map((id) => ({ id, text: lemma(lx, id) }));
      const examples = groupA.map((g) => `${lemma(lx, g.toId)} (${lemma(lx, g.fromId)})`).join("، ");
      return {
        kind: "odd",
        prompt: "أي كلمة لا تنتمي إلى المجموعة؟",
        questionId: null,
        versionId: null,
        noonQuestionId: null,
        subskillId: RELATION_CATEGORY[a],
        difficulty: 2,
        stem: "اكتشف الدخيل",
        passage: null,
        choices: items,
        correctId: odd.toId,
        explanation: `${examples}: ${GROUP_NAME[a]} — أما «${lemma(lx, odd.toId)}» فمن ${GROUP_NAME[b]} («${lemma(lx, odd.fromId)}»).`,
        relationshipId: odd.id,
        entryIds: [odd.fromId, odd.toId],
        hintRemoved: null,
      };
    }
  }
  return null;
}

/** سباق الكلمات / تحدي اليوم: a mix of meaning and relation questions. */
export function mixedRounds(lx: Lexicon, p: { n: number; rand: Rand; category?: string; preferEntries?: string[] }): Round[] {
  const meanings = meaningRounds(lx, { n: Math.ceil(p.n / 2) + 2, rand: p.rand, category: p.category, preferEntries: p.preferEntries });
  const rels: Round[] = [];
  const usedFrom = new Set<string>();
  for (const r of shuffle(lx.relations.filter((x) => !p.category || RELATION_CATEGORY[x.type] === p.category), p.rand)) {
    if (rels.length >= p.n || usedFrom.has(r.fromId)) continue;
    const q = relationRound(lx, r, p.rand);
    if (q) {
      rels.push(q);
      usedFrom.add(r.fromId);
    }
  }
  const out: Round[] = [];
  let i = 0;
  while (out.length < p.n && (i < meanings.length || i < rels.length)) {
    if (i < rels.length) out.push(rels[i]);
    if (out.length < p.n && i < meanings.length) out.push(meanings[i]);
    i++;
  }
  return out.slice(0, p.n);
}
