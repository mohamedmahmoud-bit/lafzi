/** Server-side round snapshot (stored in game_sessions.rounds). Answer keys never leave the server unanswered. */
export type Round = {
  kind: "noon_question" | "relation_recall" | "meaning" | "relation" | "match" | "memory" | "odd" | "teacher";
  /** Teacher-written question id (kind = teacher). */
  teacherQuestionId?: string;
  /** Instruction shown above the stem (e.g. «ما صوت الأسد؟»). */
  prompt?: string;
  questionId: string | null;
  versionId: string | null;
  noonQuestionId: number | null;
  subskillId: string | null;
  difficulty: number | null;
  stem: string;
  passage: string | null;
  choices: { id: string; text: string }[];
  correctId: string;
  /** Noon's explanation verbatim, or null (shown as unavailable — never generated). */
  explanation: string | null;
  relationshipId?: string;
  entryIds?: string[];
  hintRemoved: string | null;
  /** Mastery loop (journey): the word this round checks, and a second version to re-ask it with. */
  item?: { categoryId: string; entryId: string };
  alt?: { choices: { id: string; text: string }[]; correctId: string };
};

export type ClientRound = Omit<Round, "correctId" | "explanation" | "versionId" | "questionId" | "entryIds" | "relationshipId" | "teacherQuestionId" | "item" | "alt"> & {
  index: number;
  answered: null | { choiceId: string; isCorrect: boolean; correctId: string; explanation: string | null; points: number; hintUsed: boolean };
};

export type SubskillResult = { subskillId: string; nameAr: string; correct: number; total: number; masteryBefore: number; masteryAfter: number };

export type GameSummary = {
  accuracy: number;
  score: number;
  correct: number;
  total: number;
  subskills: SubskillResult[];
  weakest: { subskillId: string; nameAr: string } | null;
  improved: { subskillId: string; nameAr: string; delta: number }[];
  /** «رحلة لفظي» level outcome (level sessions only). */
  level?: LevelOutcome;
};

/** «رحلة لفظي» outcome shown on the results screen. */
export type LevelOutcome = {
  number: number;
  kind: string; // learn | review | test | corrective
  passed: boolean;
  stars: number;
  firstPass: boolean;
  nextNumber: number | null;
  /** Words in the level, and how many were right on the first try. */
  items: number;
  firstTry: number;
  /** Stage test: questions needed to pass, and how many words were missed. */
  passMark?: number;
  missed?: number;
};
