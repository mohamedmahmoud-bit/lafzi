/**
 * Vocabulary round builders. PURE: they only rearrange approved content. Boards pair approved words
 * with their approved counterpart; meaning rounds show an approved word with its approved meaning
 * among other approved meanings (checked not to be synonyms). No question text is written here —
 * teacher-written questions take priority whenever there are enough of them.
 */
import type { Lexicon, LexRelation } from "@/features/lexicon/content";
import { RELATION_CATEGORY, RELATION_TEXT, type RelationType } from "@/features/lexicon/mapping";
import { lexKey, meaningKey } from "@/features/lexicon/normalize";
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

/** Everyday words (also in antonyms / verbs / plurals) are "easy"; Qudurat vocabulary is "hard". */
const EASY_CATEGORIES = new Set(["vo_antonym", "vo_verb", "vo_plural"]);
export function hardness(lx: Lexicon, entryId: string): number {
  const e = lx.entries.get(entryId);
  if (!e) return 1;
  if (e.categories.some((c) => EASY_CATEGORIES.has(c))) return 1;
  if (e.categories.includes("vo_qudurat")) return Math.max(3, e.difficulty);
  return e.difficulty;
}

const letters = (w: string) => lexKey(w).replace(/[\s]/g, "");
/** Shared letters (multiset) — look-alike words make real traps (نعيق / نهيق / نقيق). */
export function letterSimilarity(a: string, b: string): number {
  const x = [...letters(a)];
  const y = [...letters(b)];
  let shared = 0;
  for (const ch of x) {
    const i = y.indexOf(ch);
    if (i >= 0) {
      shared++;
      y.splice(i, 1);
    }
  }
  return shared / Math.max(x.length, 1);
}

/** Content words of a meaning (≥3 letters, without a leading «و»). */
const contentWords = (m: string) =>
  new Set(
    meaningKey(m)
      .split(/[\s،,؛.]+/)
      .map((w) => w.replace(/^و(?=..)/, ""))
      .filter((w) => w.length >= 3),
  );
/** Two meanings sharing a key word could both be right → never pair them as answer + distractor. */
export const sharesKeyWord = (a: string, b: string) => {
  const A = contentWords(a);
  return [...contentWords(b)].some((w) => A.has(w));
};

type Pick = { rand: Rand; preferEntries?: string[]; skipEntries?: string[]; minHardness?: number; onlyEntries?: string[] };

/** Order a pool: due words first, then hardest, then random; skip mastered words unless the pool runs dry. */
function orderPool<T extends { entryId: string }>(lx: Lexicon, pool: T[], n: number, p: Pick): T[] {
  const prefer = new Set(p.preferEntries ?? []);
  const skip = new Set(p.skipEntries ?? []);
  let use = pool.filter((x) => !skip.has(x.entryId) || prefer.has(x.entryId));
  if (use.length < n) use = pool;
  if (p.minHardness) {
    const hard = use.filter((x) => hardness(lx, x.entryId) >= p.minHardness!);
    if (hard.length >= n) use = hard;
  }
  const keyed = shuffle(use, p.rand).map((x) => ({ x, k: (prefer.has(x.entryId) ? 10 : 0) + hardness(lx, x.entryId) + p.rand() * 1.5 }));
  return keyed.sort((a, b) => b.k - a.k).map((y) => y.x);
}

/** صائد المعاني: word → its approved meaning among 3 close-but-wrong approved meanings. */
export function meaningRounds(lx: Lexicon, p: { n: number; category?: string } & Pick): Round[] {
  const filtered = lx.senses.filter((s) => (!p.category || lx.entries.get(s.entryId)?.categories.includes(p.category)) && (!p.onlyEntries || p.onlyEntries.includes(s.entryId)));
  const byEntry = new Map<string, (typeof filtered)[number]>();
  for (const s of shuffle(filtered, p.rand)) if (!byEntry.has(s.entryId)) byEntry.set(s.entryId, s);
  const pool = orderPool(lx, [...byEntry.values()], p.n, p);
  const out: Round[] = [];
  for (const s of pool) {
    if (out.length >= p.n) break;
    const excluded = synonymsOf(lx, s.entryId);
    const own = lx.senses.filter((x) => x.entryId === s.entryId).map((x) => x.meaning);
    const ownKeys = new Set(own.map(meaningKey));
    const sameCat = primaryCategory(lx, s.entryId);
    const target = lemma(lx, s.entryId);
    const len = s.meaning.length;
    const candidates = lx.senses.filter((d) => !excluded.has(d.entryId) && !ownKeys.has(meaningKey(d.meaning)) && !own.some((m) => sharesKeyWord(m, d.meaning)));
    // Practising one category: every option comes from that category (sounds vs sounds, plurals vs plurals).
    const inCategory = p.category ? candidates.filter((d) => lx.entries.get(d.entryId)?.categories.includes(p.category!)) : candidates;
    const scored = (inCategory.length >= 3 ? inCategory : candidates)
      .map((d) => ({
        d,
        score:
          (primaryCategory(lx, d.entryId) === sameCat ? 2 : 0) +
          2 * letterSimilarity(target, lemma(lx, d.entryId)) +
          (Math.abs(d.meaning.length - len) <= 6 ? 1 : 0) +
          (hardness(lx, d.entryId) >= hardness(lx, s.entryId) ? 0.5 : 0) +
          p.rand() * 1.2,
      }))
      .sort((a, b) => b.score - a.score);
    const distractors: typeof filtered = [];
    for (const { d } of scored) {
      if (distractors.length >= 3) break;
      if (distractors.some((x) => meaningKey(x.meaning) === meaningKey(d.meaning) || sharesKeyWord(x.meaning, d.meaning))) continue;
      distractors.push(d);
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
      difficulty: Math.max(s.difficulty, hardness(lx, s.entryId)),
      stem: target,
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

/** The words inside a lemma («هزيز وحفيف» → هزيز، حفيف), normalized. */
const wordsOfLemma = (w: string) =>
  lexKey(w)
    .split(/[\s،,/]+/)
    .map((x) => x.replace(/^و(?=...)/, ""))
    .filter((x) => x.length >= 2);

/**
 * One relation question from approved pairs only, e.g. «ما اسم صوت «البقرة»؟» → خُوار among other
 * approved sounds that are NOT valid for this word. The prompt is the fixed label of the relation.
 */
export function relationRound(lx: Lexicon, rel: LexRelation, rand: Rand): Round | null {
  const valid = rightsOf(lx, rel.type, rel.fromId);
  if (rel.type === "synonym" || rel.type === "antonym") {
    // Symmetric relations: anything paired with the word in either direction is also right.
    for (const r of lx.relations) if (r.type === rel.type && r.toId === rel.fromId) valid.add(r.fromId);
    if (rel.type === "synonym") for (const id of synonymsOf(lx, rel.fromId)) valid.add(id);
  }
  const validKeys = new Set([...valid].map((id) => meaningKey(lemma(lx, id))));
  // «نعيق ونعيب» contains the right answer «نعيق» → it can never be a wrong option.
  const validWords = new Set([...valid].flatMap((id) => wordsOfLemma(lemma(lx, id))));
  const answer = lemma(lx, rel.toId);
  const others = shuffle(
    [...new Set(lx.relations.filter((r) => r.type === rel.type && !valid.has(r.toId) && r.toId !== rel.fromId).map((r) => r.toId))].filter(
      (id) => !validKeys.has(meaningKey(lemma(lx, id))) && !wordsOfLemma(lemma(lx, id)).some((w) => validWords.has(w)),
    ),
    rand,
  )
    .map((id) => ({ id, k: letterSimilarity(answer, lemma(lx, id)) * 2 + rand() }))
    .sort((a, b) => b.k - a.k)
    .map((x) => x.id);
  const distractors: string[] = [];
  for (const id of others) {
    if (distractors.length >= 3) break;
    const ws = wordsOfLemma(lemma(lx, id));
    if (!distractors.some((d) => meaningKey(lemma(lx, d)) === meaningKey(lemma(lx, id)) || wordsOfLemma(lemma(lx, d)).some((w) => ws.includes(w)))) distractors.push(id);
  }
  if (distractors.length < 3) return null;
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

/** n relation questions of one type (one per left word), due words first. */
export function relationRounds(lx: Lexicon, type: RelationType, p: { n: number } & Pick): Round[] {
  const byFrom = new Map<string, LexRelation>();
  for (const r of shuffle(lx.relations.filter((x) => x.type === type && (!p.onlyEntries || p.onlyEntries.includes(x.fromId))), p.rand)) if (!byFrom.has(r.fromId)) byFrom.set(r.fromId, r);
  const pool = orderPool(lx, [...byFrom.values()].map((r) => ({ entryId: r.fromId, r })), p.n, p);
  const out: Round[] = [];
  for (const { r } of pool) {
    if (out.length >= p.n) break;
    const round = relationRound(lx, r, p.rand);
    if (round) out.push(round);
  }
  return out;
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

