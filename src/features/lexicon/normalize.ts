/** Lexical key: strip diacritics/tatweel, unify alef/yaa/taa marbuta, and a leading «ال». */
export function lexKey(word: string): string {
  let s = word
    .normalize("NFC")
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
  if (s.startsWith("ال") && s.length > 4 && !s.includes(" ")) s = s.slice(2);
  return s;
}

/** Same check for meanings (to detect identical / circular definitions). */
export const meaningKey = (m: string) => lexKey(m).replace(/[،,.؛]/g, " ").replace(/\s+/g, " ").trim();

export const isPlaceholder = (v: string | null | undefined) => !v || /^[-—–\s]*$/.test(v);
