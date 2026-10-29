/**
 * Game registry. Every game plays official Noon questions in their NATIVE form (same stem, same
 * options, same answer). A game that would change the task needs an approved "transform"
 * compatibility row — none are enabled yet, by design.
 */
export type GameDef = {
  id: string;
  letter: "A" | "B" | "C" | "D" | "E" | "F";
  nameAr: string;
  topicId: string;
  tagline: string;
  description: string;
  /** Default availability; admins can flip game_types.status. */
  status: "live" | "coming_soon";
  /** Source of rounds. */
  source: "question_bank" | "vocabulary";
  sort: number;
};

export const GAMES: GameDef[] = [
  {
    id: "relations_hunter",
    letter: "A",
    nameAr: "صائد العلاقات",
    topicId: "verbal_analogy",
    tagline: "اكتشف العلاقة قبل أن تنظر في الخيارات",
    description: "أسئلة التناظر اللفظي من بنك نون. حدّد العلاقة في الزوج الأول بنفسك، ثم ابحث عن الزوج الذي يحملها بالترتيب نفسه.",
    status: "live",
    source: "question_bank",
    sort: 1,
  },
  {
    id: "complete_mission",
    letter: "B",
    nameAr: "أكمل المهمة",
    topicId: "sentence_completion",
    tagline: "اقرأ السياق، توقّع الكلمة، ثم تحقّق",
    description: "أسئلة إكمال الجمل من بنك نون. ابحث عن أداة الربط أو القرينة التي تحسم المعنى قبل الاختيار.",
    status: "live",
    source: "question_bank",
    sort: 2,
  },
  {
    id: "language_detective",
    letter: "C",
    nameAr: "المحقق اللغوي",
    topicId: "contextual_error",
    tagline: "ابحث عن الكلمة التي تكسر المعنى",
    description: "أسئلة الخطأ السياقي من بنك نون.",
    status: "coming_soon",
    source: "question_bank",
    sort: 3,
  },
  {
    id: "reader_adventure",
    letter: "D",
    nameAr: "مغامرة القارئ",
    topicId: "reading_comprehension",
    tagline: "نص من نون وأسئلته",
    description: "أسئلة استيعاب المقروء مع نصوصها الأصلية من بنك نون.",
    status: "coming_soon",
    source: "question_bank",
    sort: 4,
  },
  {
    id: "word_treasure",
    letter: "E",
    nameAr: "كنز الكلمات",
    topicId: "vocabulary",
    tagline: "كلمات من أسئلة نون نفسها",
    description: "كلمات مستخرجة من أسئلة بنك نون ومراجَعة بشريًا، مع السؤال الأصلي الذي ظهرت فيه.",
    status: "live",
    source: "vocabulary",
    sort: 5,
  },
  {
    id: "odd_one_out",
    letter: "F",
    nameAr: "اكتشف الدخيل",
    topicId: "odd_one_out",
    tagline: "أي كلمة لا تنتمي؟",
    description: "أسئلة الاختلاف من بنك نون.",
    status: "coming_soon",
    source: "question_bank",
    sort: 6,
  },
];

export const gameById = (id: string) => GAMES.find((g) => g.id === id) ?? null;

/** Games that can play a topic's MCQs natively (question_game_compatibility.game_mode). */
export function nativeModesForTopic(topicId: string): string[] {
  return GAMES.filter((g) => g.source === "question_bank" && g.topicId === topicId).map((g) => g.id);
}

/** Topics with a game in the registry (used by validation's game_compatible info check). */
export const PLAYABLE_TOPICS = new Set(GAMES.filter((g) => g.source === "question_bank").map((g) => g.topicId));
