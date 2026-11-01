/**
 * Round builders for the vocabulary games. PURE: they only rearrange approved content
 * (approved meanings, approved relationships). No text is generated; no distractor is invented —
 * every wrong option is another approved meaning/word, checked to be unambiguously wrong.
 */
import type { Lexicon, LexRelation } from "@/features/lexicon/content";
import { GROUP_NAME, GROUPABLE, RELATION_CATEGORY, RELATION_TEXT, type RelationType } from "@/features/lexicon/mapping";
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

type Pick = { rand: Rand; preferEntries?: string[]; skipEntries?: string[]; minHardness?: number };

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
  const filtered = lx.senses.filter((s) => !p.category || lx.entries.get(s.entryId)?.categories.includes(p.category));
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
    const scored = lx.senses
      .filter((d) => !excluded.has(d.entryId) && !ownKeys.has(meaningKey(d.meaning)) && !own.some((m) => sharesKeyWord(m, d.meaning)))
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

/** One relation question: "ما صوت الأسد؟" with 3 other approved answers of the same type that are NOT valid for this word. */
export function relationRound(lx: Lexicon, rel: LexRelation, rand: Rand): Round | null {
  const valid = rightsOf(lx, rel.type, rel.fromId);
  const validKeys = new Set([...valid].map((id) => meaningKey(lemma(lx, id))));
  const answer = lemma(lx, rel.toId);
  const others = shuffle(
    [...new Set(lx.relations.filter((r) => r.type === rel.type && !valid.has(r.toId)).map((r) => r.toId))].filter((id) => !validKeys.has(meaningKey(lemma(lx, id)))),
    rand,
  )
    .map((id) => ({ id, k: letterSimilarity(answer, lemma(lx, id)) * 2 + rand() }))
    .sort((a, b) => b.k - a.k)
    .map((x) => x.id);
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
export function mixedRounds(lx: Lexicon, p: { n: number; category?: string } & Pick): Round[] {
  const meanings = meaningRounds(lx, { ...p, n: Math.ceil(p.n / 2) + 2 });
  const rels: Round[] = [];
  const usedFrom = new Set<string>();
  const relPool = orderPool(lx, lx.relations.filter((x) => !p.category || RELATION_CATEGORY[x.type] === p.category).map((r) => ({ ...r, entryId: r.fromId })), p.n, { ...p, minHardness: undefined });
  for (const r of relPool) {
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

/** Category → the relation it is about (null = a meaning-only category such as مفردات القدرات). */
export function relationForCategory(category: string): RelationType | null {
  const hit = (Object.entries(RELATION_CATEGORY) as [RelationType, string][]).find(([, c]) => c === category);
  return hit ? hit[0] : null;
}

/**
 * Practice ONE category: relation categories ask about that relation («ما صوت الأسد؟»), meaning
 * categories ask about meanings — never questions from other categories.
 */
export function categoryRounds(lx: Lexicon, p: { category: string; n: number } & Pick): Round[] {
  const type = relationForCategory(p.category);
  if (!type) return meaningRounds(lx, { ...p, minHardness: undefined });
  const rels = orderPool(lx, lx.relations.filter((r) => r.type === type).map((r) => ({ ...r, entryId: r.fromId })), p.n, { ...p, minHardness: undefined });
  const out: Round[] = [];
  const usedFrom = new Set<string>();
  for (const r of rels) {
    if (out.length >= p.n) break;
    if (usedFrom.has(r.fromId)) continue;
    const q = relationRound(lx, r, p.rand);
    if (q) {
      out.push(q);
      usedFrom.add(r.fromId);
    }
  }
  // Synonyms/antonyms: add meaning questions about the same words when relations run short.
  if (out.length < p.n && (type === "synonym" || type === "antonym")) {
    out.push(...meaningRounds(lx, { ...p, n: p.n - out.length, minHardness: undefined }).filter((m) => !out.some((o) => o.stem === m.stem)));
  }
  return out.slice(0, p.n);
}
