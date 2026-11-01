/**
 * Game registry. Vocabulary games ("lexicon") play only approved Lafzi vocabulary.
 * The Qudurat practice games ("question_bank") play published Noon questions in their native form.
 */
export type GameDef = {
  id: string;
  nameAr: string;
  topicId: string;
  tagline: string;
  description: string;
  status: "live" | "coming_soon" | "retired";
  source: "lexicon" | "question_bank" | "daily";
  /** play = main game shelf; qudurat = secondary practice section. */
  section: "play" | "qudurat" | "hidden";
  /** UI mechanic. */
  mechanic: "mcq" | "match" | "memory" | "race" | "odd";
  icon: string;
  minutes: number;
  sort: number;
};

export const GAMES: GameDef[] = [
  { id: "meaning_hunter", nameAr: "صائد المعاني", topicId: "vocabulary", tagline: "أسئلة المعلم — اختر الإجابة الصحيحة", description: "أسئلة كتبها فريق لفظي، يختار منها اللعب في كل جولة.", status: "live", source: "lexicon", section: "play", mechanic: "mcq", icon: "target", minutes: 2, sort: 1 },
  { id: "match_pairs", nameAr: "وصلها صح", topicId: "vocabulary", tagline: "صِل كل كلمة بقرينتها", description: "أصوات، صغار، مساكن، جموع، مرادفات وأضداد — صِل الأزواج كلها.", status: "live", source: "lexicon", section: "play", mechanic: "match", icon: "link", minutes: 2, sort: 2 },
  { id: "word_race", nameAr: "سباق الكلمات", topicId: "vocabulary", tagline: "٧٥ ثانية… كم سؤالًا تلحق؟", description: "أسئلة المعلم ضد الوقت: الدقة أولًا، والسرعة تضيف نقاطًا.", status: "live", source: "lexicon", section: "play", mechanic: "race", icon: "timer", minutes: 2, sort: 3 },
  { id: "odd_one_out", nameAr: "الكلمة الدخيلة", topicId: "vocabulary", tagline: "", description: "أوقفت: كانت أسئلتها تُبنى آليًا.", status: "retired", source: "lexicon", section: "hidden", mechanic: "odd", icon: "search", minutes: 2, sort: 4 },
  { id: "memory", nameAr: "ذاكرة لفظي", topicId: "vocabulary", tagline: "اقلب البطاقات وطابق الأزواج", description: "بطاقات مقلوبة: طابق كل كلمة بقرينتها بأقل عدد من المحاولات.", status: "live", source: "lexicon", section: "play", mechanic: "memory", icon: "brain", minutes: 3, sort: 5 },
  { id: "daily_challenge", nameAr: "تحدي اليوم", topicId: "vocabulary", tagline: "نفس التحدي لكل الطلاب اليوم", description: "تحدٍّ قصير واحد لكل الطلاب اليوم — يحسب لسلسلتك ومهمتك.", status: "live", source: "daily", section: "hidden", mechanic: "mcq", icon: "flame", minutes: 3, sort: 0 },
  // Official Noon questions are not shown to students (only words extracted from them are used).
  { id: "relations_hunter", nameAr: "تناظر لفظي", topicId: "verbal_analogy", tagline: "", description: "", status: "retired", source: "question_bank", section: "hidden", mechanic: "mcq", icon: "scale", minutes: 4, sort: 10 },
  { id: "complete_mission", nameAr: "إكمال الجمل", topicId: "sentence_completion", tagline: "", description: "", status: "retired", source: "question_bank", section: "hidden", mechanic: "mcq", icon: "pen", minutes: 4, sort: 11 },
  { id: "word_treasure", nameAr: "كنز الكلمات", topicId: "vocabulary", tagline: "", description: "استُبدلت بألعاب المفردات الجديدة.", status: "retired", source: "lexicon", section: "hidden", mechanic: "mcq", icon: "gem", minutes: 2, sort: 99 },
];

export const gameById = (id: string) => GAMES.find((g) => g.id === id) ?? null;
export const PLAY_GAMES = GAMES.filter((g) => g.section === "play");
export const QUDURAT_GAMES = GAMES.filter((g) => g.section === "qudurat");
/** Games a friend can be challenged in (fixed, equivalent round sets). */
export const CHALLENGE_GAMES = ["meaning_hunter", "word_race", "match_pairs"];

/** Games that can play a topic's MCQs natively (question_game_compatibility.game_mode). */
export function nativeModesForTopic(topicId: string): string[] {
  return GAMES.filter((g) => g.source === "question_bank" && g.topicId === topicId).map((g) => g.id);
}

/** Topics with a question-bank game (validation's game_compatible info check). */
export const PLAYABLE_TOPICS = new Set(GAMES.filter((g) => g.source === "question_bank").map((g) => g.topicId));
