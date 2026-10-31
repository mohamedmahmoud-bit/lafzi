import type { SourceRow } from "./dataset";
import { RELATION_LABEL, SECTION_CATEGORY, type RelationType } from "./mapping";
import { lexKey, meaningKey } from "./normalize";
import { LINGUISTIC_NOTES, noteKey } from "./review-notes";

export type RowFlag = { code: string; severity: "error" | "warning"; message: string };
export type ValidatedRow = SourceRow & {
  categoryId: string | null;
  relationType: RelationType | null;
  flags: RowFlag[];
  /** clean = no flags → eligible for one-click reviewer approval. */
  status: "staged" | "flagged";
};

const ARABIC_ONLY = /^[ء-ي٠-٩ً-ْٰـ\s،,.()«»؛:'"-]+$/;
const sectionName = (s: string) => s.replace(/\(\s*\d+\s*\)/, "").trim();

/**
 * Automated checks + linguistic review notes. Pure; never edits the source values.
 * Nothing here publishes anything — it only decides which rows need a human.
 */
export function validateRows(rows: SourceRow[]): ValidatedRow[] {
  const seenExact = new Map<string, number>();
  const byWordInCat = new Map<string, SourceRow[]>();
  const byKey = new Map<string, SourceRow[]>();
  for (const r of rows) {
    const cat = SECTION_CATEGORY[sectionName(r.section)] ?? null;
    const k = `${cat}|${lexKey(r.word)}`;
    byWordInCat.set(k, [...(byWordInCat.get(k) ?? []), r]);
    byKey.set(lexKey(r.word), [...(byKey.get(lexKey(r.word)) ?? []), r]);
  }

  return rows.map((r) => {
    const flags: RowFlag[] = [];
    const add = (code: string, severity: RowFlag["severity"], message: string) => flags.push({ code, severity, message });
    const categoryId = SECTION_CATEGORY[sectionName(r.section)] ?? null;
    const label = r.relationLabel?.trim() ?? null;
    const relationType = label && label in RELATION_LABEL ? RELATION_LABEL[label] : null;

    if (!categoryId) add("unknown_category", "error", `قسم غير معروف: «${r.section}»`);
    if (label && !(label in RELATION_LABEL)) add("unknown_relation", "error", `نوع علاقة غير معروف: «${label}»`);
    if (!ARABIC_ONLY.test(r.word)) add("non_arabic", "error", "الكلمة تحتوي رموزًا غير عربية");
    if (relationType && !r.related) add("missing_related", "error", "علاقة بلا كلمة مرتبطة");
    if (!relationType && !r.meaning) add("missing_meaning", "error", "لا يوجد معنى");
    if (relationType && r.related && lexKey(r.related) === lexKey(r.word)) add("self_relation", "error", "الكلمة مرتبطة بنفسها");
    if (r.related && /\s+و\S/.test(r.related) && relationType !== "synonym") add("multiple_related", "warning", `أكثر من قيمة في «${r.related}» — اختر قيمة واحدة`);

    if (r.meaning) {
      const w = lexKey(r.word);
      const parts = meaningKey(r.meaning).split(/\s+و?|،/).map((x) => x.replace(/^و/, ""));
      if (parts.includes(w) || meaningKey(r.meaning).includes(` ${w}`) || meaningKey(r.meaning).startsWith(`${w} `)) {
        add("circular_meaning", "warning", "المعنى يكرر الكلمة نفسها");
      }
    }

    const exact = `${categoryId}|${lexKey(r.word)}|${lexKey(r.related ?? "")}|${meaningKey(r.meaning ?? "")}`;
    if (seenExact.has(exact)) add("duplicate_row", "error", `تكرار للسجل رقم ${seenExact.get(exact)}`);
    else seenExact.set(exact, r.rowNumber);

    const sameCat = byWordInCat.get(`${categoryId}|${lexKey(r.word)}`) ?? [];
    if (sameCat.length > 1 && !relationType) {
      const meanings = new Set(sameCat.map((x) => meaningKey(x.meaning ?? "")));
      if (meanings.size > 1) add("inconsistent_meaning", "warning", `الكلمة واردة ${sameCat.length} مرات في القسم نفسه بمعانٍ مختلفة`);
      else if (!flags.some((f) => f.code === "duplicate_row")) add("possible_duplicate", "warning", "الكلمة مكررة في القسم");
    }
    // Same word written with/without «ال» in the same meaning list (e.g. الإفراط / إفراط).
    const variants = new Set((byKey.get(lexKey(r.word)) ?? []).filter((x) => !x.relationLabel || x.relationLabel === "معنى").map((x) => x.word));
    if (!relationType && variants.size > 1) add("spelling_variant", "warning", `صيغ متعددة للكلمة: ${[...variants].join(" / ")}`);

    const note = LINGUISTIC_NOTES[noteKey(categoryId, r.word, relationType ? r.related : null)];
    if (note) add("linguistic_review", "warning", note);

    return { ...r, categoryId, relationType, flags, status: flags.length ? "flagged" : "staged" };
  });
}

export function summarize(rows: ValidatedRow[]) {
  const s: Record<string, number> = { total: rows.length, clean: 0, flagged: 0 };
  for (const r of rows) {
    s[r.status === "staged" ? "clean" : "flagged"]++;
    for (const f of r.flags) s[`flag:${f.code}`] = (s[`flag:${f.code}`] ?? 0) + 1;
  }
  return s;
}
