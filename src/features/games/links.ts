import { RELATION_CATEGORY } from "@/features/lexicon/mapping";

const RELATION_CATEGORIES = new Set(Object.values(RELATION_CATEGORY));

/** Category practice: word-pair categories open a matching board; others open the teacher questions. */
export function categoryHref(categoryId: string) {
  return RELATION_CATEGORIES.has(categoryId) ? `/play/match_pairs?category=${categoryId}` : `/play/meaning_hunter?category=${categoryId}`;
}
