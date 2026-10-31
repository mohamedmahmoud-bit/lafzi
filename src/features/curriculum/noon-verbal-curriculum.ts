/**
 * Snapshot of Noon's LIVE verbal curriculum (subject 249 «الجزء اللفظي», board 46 «قدرات»),
 * retrieved from Noon's admin curriculum API on 2026-10-29. Deleted nodes are excluded.
 * Used to seed the canonical taxonomy; providers refresh it via getCurriculum().
 * These are official Noon IDs — do not edit by hand; re-sync instead.
 */
export type CurriculumSnapshotTopic = {
  slug: string;
  nameAr: string;
  noonChapterId: number | null;
  sort: number;
  subskills: { noonTopicId: number | null; noonSubtopicId: number | null; nameAr: string; id?: string }[];
};

export const NOON_VERBAL_SUBJECT_ID = 249;

export const NOON_VERBAL_CURRICULUM: CurriculumSnapshotTopic[] = [
  {
    slug: "verbal_analogy",
    nameAr: "التناظر اللفظي",
    noonChapterId: 2854,
    sort: 1,
    subskills: [
      { noonTopicId: 23591, noonSubtopicId: 1646, nameAr: "المعنى والدلالة" },
      { noonTopicId: 23591, noonSubtopicId: 1173, nameAr: "الجزء والكل" },
      { noonTopicId: 23591, noonSubtopicId: 1673, nameAr: "السببية" },
      { noonTopicId: 23591, noonSubtopicId: 1175, nameAr: "الاقتران" },
      { noonTopicId: 23591, noonSubtopicId: 1647, nameAr: "التصنيفية" },
      { noonTopicId: 23591, noonSubtopicId: 1178, nameAr: "الاحتياج" },
      { noonTopicId: 23591, noonSubtopicId: 1179, nameAr: "الوظيفية" },
      { noonTopicId: 23591, noonSubtopicId: 1648, nameAr: "الشيء وأصله" },
      { noonTopicId: 23591, noonSubtopicId: 1649, nameAr: "المرحلية" },
      { noonTopicId: 23591, noonSubtopicId: 1650, nameAr: "الوصفية" },
      { noonTopicId: 23591, noonSubtopicId: 1651, nameAr: "الانتماء والهوية" },
      { noonTopicId: 23591, noonSubtopicId: 1652, nameAr: "كلمات تربطها أكثر من علاقة" },
      { noonTopicId: 23586, noonSubtopicId: 1653, nameAr: "بناء الكلمة" },
      { noonTopicId: 23586, noonSubtopicId: 1654, nameAr: "الجناس" },
    ],
  },
  {
    slug: "reading_comprehension",
    nameAr: "استيعاب المقروء",
    noonChapterId: 2855,
    sort: 2,
    subskills: [
      { noonTopicId: 25658, noonSubtopicId: 1655, nameAr: "العلاقات بين الجمل والفقرات" },
      { noonTopicId: 25658, noonSubtopicId: 1656, nameAr: "فكرة النص" },
      { noonTopicId: 25658, noonSubtopicId: 1657, nameAr: "طبيعة النص وموقف كاتبه" },
      { noonTopicId: 25658, noonSubtopicId: 1658, nameAr: "الروابط الزمنية والعددية في النص" },
      { noonTopicId: 25658, noonSubtopicId: 1660, nameAr: "استخلاص المفاهيم من النص" },
      { noonTopicId: 25658, noonSubtopicId: 1661, nameAr: "التعامل مع المفردات من سياق النص" },
      { noonTopicId: 25658, noonSubtopicId: 1662, nameAr: "الروابط والدلالات النصية" },
    ],
  },
  {
    slug: "sentence_completion",
    nameAr: "إكمال الجمل",
    noonChapterId: 2856,
    sort: 3,
    subskills: [
      { noonTopicId: 23610, noonSubtopicId: 1663, nameAr: "أنواع العلاقات بين الجمل" },
      { noonTopicId: 23611, noonSubtopicId: 1664, nameAr: "المعنى والدلالة في الجملة" },
    ],
  },
  {
    slug: "contextual_error",
    nameAr: "الخطأ السياقي",
    noonChapterId: 2857,
    sort: 4,
    subskills: [
      { noonTopicId: 23615, noonSubtopicId: 1665, nameAr: "أنواع العلاقات بين الجمل" },
      { noonTopicId: 25660, noonSubtopicId: 1666, nameAr: "المعنى والدلالة في الجملة" },
    ],
  },
  {
    slug: "odd_one_out",
    nameAr: "الاختلاف (المفردة الشاذة)",
    noonChapterId: 2858,
    sort: 5,
    subskills: [
      { noonTopicId: 23619, noonSubtopicId: 1667, nameAr: "المعنى والدلالة" },
      { noonTopicId: 23619, noonSubtopicId: 1273, nameAr: "الجزء والكل" },
      { noonTopicId: 23619, noonSubtopicId: 1669, nameAr: "السببية" },
      { noonTopicId: 23619, noonSubtopicId: 1275, nameAr: "الاقتران" },
      { noonTopicId: 23619, noonSubtopicId: 1671, nameAr: "التصنيفية" },
      { noonTopicId: 23619, noonSubtopicId: 1277, nameAr: "الاحتياج" },
      { noonTopicId: 23619, noonSubtopicId: 1278, nameAr: "الوظيفية" },
      { noonTopicId: 23619, noonSubtopicId: 1674, nameAr: "الشيء وأصله" },
      { noonTopicId: 23619, noonSubtopicId: 1675, nameAr: "المرحلية" },
      { noonTopicId: 23619, noonSubtopicId: 1676, nameAr: "الوصفية" },
      { noonTopicId: 23619, noonSubtopicId: 1677, nameAr: "الانتماء والهوية" },
      { noonTopicId: 23619, noonSubtopicId: 1678, nameAr: "التمييز بين مفردات تربطها أكثر من علاقة" },
      { noonTopicId: 23620, noonSubtopicId: 1679, nameAr: "بناء الكلمة" },
      { noonTopicId: 23620, noonSubtopicId: 1680, nameAr: "الجناس" },
    ],
  },
  {
    slug: "association",
    nameAr: "الارتباط",
    noonChapterId: 2859,
    sort: 6,
    subskills: [
      { noonTopicId: 23623, noonSubtopicId: 1681, nameAr: "المعنى والدلالة" },
      { noonTopicId: 23623, noonSubtopicId: 1363, nameAr: "الجزء والكل" },
      { noonTopicId: 23623, noonSubtopicId: 1682, nameAr: "السببية" },
      { noonTopicId: 23623, noonSubtopicId: 1304, nameAr: "الاقتران" },
      { noonTopicId: 23623, noonSubtopicId: 1683, nameAr: "التصنيفية" },
      { noonTopicId: 23623, noonSubtopicId: 1306, nameAr: "الاحتياج" },
      { noonTopicId: 23623, noonSubtopicId: 1307, nameAr: "الوظيفية" },
      { noonTopicId: 23623, noonSubtopicId: 1684, nameAr: "الشيء وأصله" },
      { noonTopicId: 23623, noonSubtopicId: 1685, nameAr: "المرحلية" },
      { noonTopicId: 23623, noonSubtopicId: 1686, nameAr: "الوصفية" },
      { noonTopicId: 23623, noonSubtopicId: 1687, nameAr: "الانتماء والهوية" },
      { noonTopicId: 23623, noonSubtopicId: 1688, nameAr: "الكلمة الأكثر ارتباطًا من حيث اتجاه المعنى" },
      { noonTopicId: 23624, noonSubtopicId: 1689, nameAr: "بناء الكلمة" },
      { noonTopicId: 23624, noonSubtopicId: 1690, nameAr: "الجناس" },
    ],
  },
  {
    slug: "extra_word",
    nameAr: "الكلمة الزائدة",
    noonChapterId: 5505,
    sort: 7,
    subskills: [
      { noonTopicId: 25663, noonSubtopicId: 1696, nameAr: "الكلمة التي يمكن حذفها" },
      { noonTopicId: 25663, noonSubtopicId: 1697, nameAr: "الكلمة التي لا يمكن حذفها" },
      { noonTopicId: 25664, noonSubtopicId: 1698, nameAr: "الكلمة التي يمكن إضافتها" },
      { noonTopicId: 25664, noonSubtopicId: 1699, nameAr: "الكلمة التي يمكن البدء بها" },
      { noonTopicId: 25664, noonSubtopicId: 1700, nameAr: "الكلمة التي يمكن استبدالها" },
    ],
  },
  {
    // Not a Noon chapter: vocabulary is DERIVED from bank questions (see features/vocab-bank).
    slug: "vocabulary",
    nameAr: "المفردات",
    noonChapterId: null,
    sort: 0,
    // Lafzi vocabulary categories (not Noon curriculum nodes). One word may belong to several.
    subskills: [
      { id: "vo_synonym", noonTopicId: null, noonSubtopicId: null, nameAr: "مترادفات" },
      { id: "vo_antonym", noonTopicId: null, noonSubtopicId: null, nameAr: "أضداد" },
      { id: "vo_animal_sound", noonTopicId: null, noonSubtopicId: null, nameAr: "أصوات الحيوانات" },
      { id: "vo_animal_young", noonTopicId: null, noonSubtopicId: null, nameAr: "صغار الحيوانات" },
      { id: "vo_animal_home", noonTopicId: null, noonSubtopicId: null, nameAr: "مساكن الحيوانات" },
      { id: "vo_plural", noonTopicId: null, noonSubtopicId: null, nameAr: "جموع" },
      { id: "vo_verb", noonTopicId: null, noonSubtopicId: null, nameAr: "أفعال" },
      { id: "vo_qudurat", noonTopicId: null, noonSubtopicId: null, nameAr: "مفردات القدرات" },
      { id: "vo_animal_pair", noonTopicId: null, noonSubtopicId: null, nameAr: "أزواج الحيوانات" },
    ],
  },
];

/** Canonical subskill id for a Noon subtopic. Stable across syncs. */
export const subskillIdFor = (noonSubtopicId: number) => `st_${noonSubtopicId}`;
