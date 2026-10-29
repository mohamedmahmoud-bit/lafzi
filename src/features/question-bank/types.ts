/** Normalised Noon question — the only shape the rest of the app consumes. */
export type NoonCurriculumTag = {
  subjectId: number | null;
  chapterId: number | null;
  topicId: number | null;
  subtopicId: number | null;
  conceptId: number | null;
  chapterName: string | null;
  subtopicName: string | null;
  conceptName: string | null;
};

export type NoonQuestion = {
  noonQuestionId: number;
  type: string;
  stem: string;
  choices: { id: string; text: string; hasMedia: boolean }[];
  correctChoiceIds: string[];
  isMultiSelect: boolean;
  /** Noon's own flag: the options may be shown in any order. */
  shuffleChoices: boolean;
  /** Noon-authored explanation as plain text, or null when the bank has none (never invented). */
  explanation: string | null;
  /** Linked reading passage (Noon additionalMaterials of type "reference"). */
  reference: { noonReferenceId: number; body: string } | null;
  difficulty: number | null;
  curriculum: NoonCurriculumTag[];
  suitableForPractice: boolean | null;
  reportStatus: string | null;
  examPaperIds: number[];
  /** Noon exposes createdAt only; there is no modification timestamp in the API. */
  createdAt: string | null;
};

/** The raw Noon QuestionDTO (only the fields we read). */
export type NoonQuestionDTO = {
  id: number;
  text?: string | null;
  type?: string | null;
  choices?: { id: number | string; text?: string | null; url?: string | null }[];
  correctChoiceId?: number | string | null;
  correctChoiceIds?: (number | string)[] | null;
  isMultiSelect?: boolean | null;
  shuffleChoices?: boolean | null;
  suitableForPractice?: boolean | null;
  reportStatus?: string | null;
  difficultyLevel?: number | null;
  createdAt?: number | null;
  examPaperIds?: number[] | null;
  additionalMaterials?: { id: number; content?: string | null; type?: string | null }[];
  curriculum?: {
    subjectId?: number | null;
    chapterId?: number | null;
    topicId?: number | null;
    subtopicId?: number | null;
    conceptId?: number | null;
    chapter?: { name?: string } | null;
    subtopic?: { name?: string } | null;
    concept?: { name?: string } | null;
  }[];
  [k: string]: unknown;
};

export type QuestionPage = { items: NoonQuestionDTO[]; nextCursor: string | null; total: number | null };

export type NoonCurriculumNode = {
  level: "chapter" | "topic" | "subtopic" | "concept";
  noonId: number;
  parentNoonId: number | null;
  name: string;
  sequence: number;
  deleted: boolean;
};

/** What the configured source can actually do. Callers must check before relying on a feature. */
export type ProviderCapabilities = {
  search: boolean;
  details: boolean;
  curriculum: "api" | "snapshot";
  /** No Noon endpoint is known to support these; reconciliation is used instead. */
  incrementalUpdates: false;
  webhooks: false;
  modificationTimestamps: false;
};

export interface NoonQuestionBankProvider {
  readonly id: "mock" | "http" | "file" | "none";
  readonly capabilities: ProviderCapabilities;
  /** Human-readable reason when the provider cannot be used (fail closed). */
  readonly unavailableReason: string | null;
  getQuestion(id: string): Promise<NoonQuestionDTO | null>;
  listQuestions(params: { cursor?: string; limit?: number; curriculumIds?: string[] }): Promise<QuestionPage>;
  getCurriculum(): Promise<NoonCurriculumNode[]>;
}
