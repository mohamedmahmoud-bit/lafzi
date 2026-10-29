/** Server-side round snapshot (stored in game_sessions.rounds). Answer keys never leave the server unanswered. */
export type Round = {
  kind: "noon_question" | "relation_recall";
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
};

export type ClientRound = Omit<Round, "correctId" | "explanation" | "versionId" | "questionId" | "entryIds" | "relationshipId"> & {
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
};
