/**
 * «رحلة لفظي» planning (pure). The path is built from the approved dictionary in a fixed order of
 * stages; each learn level teaches ~10 words of one section, and every 5th level is a review of
 * words the student already met. Append-only: new words become new levels at the END of the path,
 * so a student's passed levels never move.
 */
import type { Lexicon } from "@/features/lexicon/content";
import { lexKey } from "@/features/lexicon/normalize";
import { relationForCategory } from "@/features/games/vocab-builders";

export const STAGES = [
  { id: "warmup", nameAr: "تمهيد", categories: ["vo_verb", "vo_plural", "vo_antonym"] },
  { id: "synonyms", nameAr: "المترادفات", categories: ["vo_synonym"] },
  { id: "animals", nameAr: "عالم الحيوان", categories: ["vo_animal_sound", "vo_animal_young", "vo_animal_home", "vo_animal_pair"] },
  { id: "qudurat", nameAr: "مفردات القدرات", categories: ["vo_qudurat"] },
] as const;
export const STAGE_NAME: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.id, s.nameAr]));

export const WORDS_PER_LEVEL = 10;
/** Smallest learn level worth playing (fewer new words wait for the next additions). */
export const MIN_WORDS_PER_LEVEL = 5;
export const REVIEW_EVERY = 5;
export const ROUNDS_PER_LEVEL = 8;
/** Pass with 6 of 8 (75%); stars: 6 → ★, 7 → ★★, 8 → ★★★. */
export const passMark = (planned: number) => Math.ceil(planned * 0.75);
export function starsFor(correct: number, planned: number) {
  if (correct < passMark(planned)) return 0;
  return correct >= planned ? 3 : correct >= planned - 1 ? 2 : 1;
}

export type ExistingLevel = { number: number; kind: string; categoryId: string | null; entryIds: string[] };
export type PlannedLevel = { number: number; stage: string; categoryId: string | null; kind: "learn" | "review"; entryIds: string[] };

/** The words a section teaches, easiest first: meanings (sections with meanings) or left words of pairs. */
export function levelItems(lx: Lexicon, categoryId: string): string[] {
  const type = relationForCategory(categoryId);
  const ids = type
    ? [...new Set(lx.relations.filter((r) => r.type === type).map((r) => r.fromId))]
    : [...new Set(lx.senses.map((s) => s.entryId))].filter((id) => lx.entries.get(id)?.categories.includes(categoryId));
  return ids
    .filter((id) => lx.entries.has(id))
    .sort((a, b) => lx.entries.get(a)!.difficulty - lx.entries.get(b)!.difficulty || lexKey(lx.entries.get(a)!.lemma).localeCompare(lexKey(lx.entries.get(b)!.lemma), "ar"));
}

function chunk(ids: string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += WORDS_PER_LEVEL) out.push(ids.slice(i, i + WORDS_PER_LEVEL));
  // A short tail joins the previous level rather than standing alone.
  if (out.length > 1 && out[out.length - 1].length < MIN_WORDS_PER_LEVEL) out[out.length - 2].push(...out.pop()!);
  return out.filter((c) => c.length >= MIN_WORDS_PER_LEVEL);
}

/** New levels to append after the existing path (words not yet in any learn level of their section). */
export function planNewLevels(lx: Lexicon, existing: ExistingLevel[]): PlannedLevel[] {
  const covered = new Set(existing.filter((l) => l.kind === "learn").flatMap((l) => l.entryIds.map((e) => `${l.categoryId}:${e}`)));
  let next = existing.reduce((m, l) => Math.max(m, l.number), 0) + 1;
  const out: PlannedLevel[] = [];
  for (const stage of STAGES) {
    for (const cat of stage.categories) {
      const fresh = levelItems(lx, cat).filter((id) => !covered.has(`${cat}:${id}`));
      for (const words of chunk(fresh)) {
        if (next % REVIEW_EVERY === 0) out.push({ number: next++, stage: stage.id, categoryId: null, kind: "review", entryIds: [] });
        out.push({ number: next++, stage: stage.id, categoryId: cat, kind: "learn", entryIds: words });
      }
    }
  }
  return out;
}
