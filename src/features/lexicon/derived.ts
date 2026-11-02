/**
 * Qudurat challenge sections DETECTED from the approved dictionary (pure). Nothing is invented: a
 * word is only tagged when the dictionary itself shows the property.
 * - كلمات بحروف مقلوبة: 3-letter words made of the same letters in another order (قطر / طرق).
 * - كلمات متشابهة في الرسم: same length, one letter differs by a commonly confused letter (فتنة / فطنة).
 * «أكثر من معنى», «يصعب قراءتها» and «يتغير معناها حسب السياق» have no reliable signal in the data
 * (different wordings of one meaning look like two meanings; reviewed tashkeel includes easy words),
 * so they come from the team's own lists (import under that heading, or «+ قسم» in the admin).
 */
import type { Lexicon } from "./content";
import { lexKey } from "./normalize";

const CONFUSABLE = ["ضظ", "ذزظ", "سص", "تط", "دض", "ثس"].map((g) => new Set(g));
const confusable = (a: string, b: string) => CONFUSABLE.some((g) => g.has(a) && g.has(b));
const letters = (w: string) => lexKey(w).replace(/\s+/g, "");

export function deriveCategories(lx: Lexicon): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>([["vo_anagram", new Set()], ["vo_confusable", new Set()]]);
  // Only words with an approved meaning (so every tagged word can be played).
  const withMeaning = new Set(lx.senses.map((s) => s.entryId));

  const ids = [...withMeaning].filter((id) => lx.entries.has(id));
  // Anagrams: 3 letters, same multiset, different word.
  const byLetters = new Map<string, string[]>();
  for (const id of ids) {
    const w = letters(lx.entries.get(id)!.lemma);
    if ([...w].length !== 3) continue;
    const k = [...w].sort().join("");
    byLetters.set(k, [...(byLetters.get(k) ?? []), id]);
  }
  for (const group of byLetters.values()) if (group.length >= 2) group.forEach((id) => out.get("vo_anagram")!.add(id));

  // Look-alike spellings: exactly one differing letter, and that pair is commonly confused.
  const ws = ids.map((id) => ({ id, w: [...letters(lx.entries.get(id)!.lemma)] })).filter((x) => x.w.length >= 3);
  for (let i = 0; i < ws.length; i++) {
    for (let j = i + 1; j < ws.length; j++) {
      const a = ws[i].w, b = ws[j].w;
      if (a.length !== b.length) continue;
      const diff = a.map((ch, k) => [ch, b[k]] as const).filter(([x, y]) => x !== y);
      if (diff.length === 1 && confusable(diff[0][0], diff[0][1])) {
        out.get("vo_confusable")!.add(ws[i].id);
        out.get("vo_confusable")!.add(ws[j].id);
      }
    }
  }
  return out;
}
