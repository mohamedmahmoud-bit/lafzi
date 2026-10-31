/** Dataset sections → Lafzi vocabulary categories, and relation labels → directional relation types. */

export type RelationType =
  | "synonym"
  | "antonym"
  | "sound"
  | "animal_young"
  | "animal_home"
  | "plural"
  | "verb_present"
  | "animal_female";

export const SECTION_CATEGORY: Record<string, string> = {
  مترادفات: "vo_synonym",
  أضداد: "vo_antonym",
  "أصوات الحيوانات": "vo_animal_sound",
  "صغار الحيوانات": "vo_animal_young",
  "مساكن الحيوانات": "vo_animal_home",
  جموع: "vo_plural",
  أفعال: "vo_verb",
  "مفردات القدرات": "vo_qudurat",
  "أزواج الحيوانات": "vo_animal_pair",
};

/** «نوع العلاقة» column → relation type (null = a meaning-only row). */
export const RELATION_LABEL: Record<string, RelationType | null> = {
  مرادف: "synonym",
  ضد: "antonym",
  صوت: "sound",
  صغير: "animal_young",
  مسكن: "animal_home",
  جمع: "plural",
  فعل: "verb_present",
  أنثى: "animal_female",
  معنى: null,
};

export const RELATION_CATEGORY: Record<RelationType, string> = {
  synonym: "vo_synonym",
  antonym: "vo_antonym",
  sound: "vo_animal_sound",
  animal_young: "vo_animal_young",
  animal_home: "vo_animal_home",
  plural: "vo_plural",
  verb_present: "vo_verb",
  animal_female: "vo_animal_pair",
};

/** Student-facing wording, written so the direction is explicit (أسد → زئير is a sound, not a synonym). */
export const RELATION_TEXT: Record<RelationType, { label: string; ask: (w: string) => string; pairHint: string }> = {
  synonym: { label: "مرادف", ask: (w) => `ما مرادف «${w}»؟`, pairHint: "صِل كل كلمة بمرادفها" },
  antonym: { label: "ضد", ask: (w) => `ما ضد «${w}»؟`, pairHint: "صِل كل كلمة بضدها" },
  sound: { label: "صوت", ask: (w) => `ما اسم صوت «${w}»؟`, pairHint: "صِل كل كائن بصوته" },
  animal_young: { label: "الصغير", ask: (w) => `ما اسم صغير «${w}»؟`, pairHint: "صِل كل حيوان بصغيره" },
  animal_home: { label: "المسكن", ask: (w) => `أين يسكن «${w}»؟`, pairHint: "صِل كل حيوان بمسكنه" },
  plural: { label: "الجمع", ask: (w) => `ما جمع «${w}»؟`, pairHint: "صِل كل مفرد بجمعه" },
  verb_present: { label: "المضارع", ask: (w) => `ما مضارع «${w}»؟`, pairHint: "صِل كل فعل بمضارعه" },
  animal_female: { label: "الأنثى", ask: (w) => `ما اسم أنثى «${w}»؟`, pairHint: "صِل كل ذكر بأنثاه" },
};

/** Default difficulty (1 easy … 3 hard) by category. */
export const CATEGORY_DIFFICULTY: Record<string, number> = {
  vo_synonym: 2,
  vo_antonym: 1,
  vo_animal_sound: 1,
  vo_animal_young: 2,
  vo_animal_home: 2,
  vo_plural: 1,
  vo_verb: 1,
  vo_qudurat: 3,
  vo_animal_pair: 2,
};

/** Groups that make sense for «الكلمة الدخيلة» (members share a clear, single property). */
export const GROUPABLE: RelationType[] = ["sound", "animal_young", "animal_home", "animal_female", "plural"];
export const GROUP_NAME: Record<string, string> = {
  sound: "أسماء أصوات",
  animal_young: "أسماء صغار حيوانات",
  animal_home: "مساكن حيوانات",
  animal_female: "إناث حيوانات",
  plural: "صيغ جمع",
};
