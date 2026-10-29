import { NOON_VERBAL_CURRICULUM } from "@/features/curriculum/noon-verbal-curriculum";
import type {
  NoonCurriculumNode,
  NoonQuestionBankProvider,
  NoonQuestionDTO,
  ProviderCapabilities,
  QuestionPage,
} from "../types";
import { buildMockQuestions } from "./mock-data";

const NO_EXTRAS = { incrementalUpdates: false, webhooks: false, modificationTimestamps: false } as const;

/** Curriculum from the bundled snapshot (used when the source has no curriculum endpoint). */
export function snapshotCurriculum(): NoonCurriculumNode[] {
  const out: NoonCurriculumNode[] = [];
  for (const t of NOON_VERBAL_CURRICULUM) {
    if (t.noonChapterId === null) continue;
    out.push({ level: "chapter", noonId: t.noonChapterId, parentNoonId: null, name: t.nameAr, sequence: t.sort, deleted: false });
    for (const [i, s] of t.subskills.entries()) {
      if (s.noonSubtopicId === null) continue;
      out.push({ level: "subtopic", noonId: s.noonSubtopicId, parentNoonId: s.noonTopicId, name: s.nameAr, sequence: i, deleted: false });
    }
  }
  return out;
}

/** Shared paging over an in-memory list, filtered by chapter ids ("chapter:2854"). */
function pageOf(all: NoonQuestionDTO[], p: { cursor?: string; limit?: number; curriculumIds?: string[] }): QuestionPage {
  const chapters = (p.curriculumIds ?? []).filter((c) => c.startsWith("chapter:")).map((c) => Number(c.slice(8)));
  const list = chapters.length ? all.filter((q) => q.curriculum?.some((c) => chapters.includes(Number(c.chapterId)))) : all;
  const size = Math.min(100, p.limit ?? 50);
  const start = Number(p.cursor ?? 0) * size;
  const items = list.slice(start, start + size);
  return { items, nextCursor: start + size < list.length ? String(Number(p.cursor ?? 0) + 1) : null, total: list.length };
}

/** ⚠️ Development mock. Mutable for tests (simulate edits/removals). */
export class MockQuestionBankProvider implements NoonQuestionBankProvider {
  readonly id = "mock" as const;
  readonly capabilities: ProviderCapabilities = { search: true, details: true, curriculum: "snapshot", ...NO_EXTRAS };
  readonly unavailableReason = null;
  constructor(public data: NoonQuestionDTO[] = buildMockQuestions()) {}
  async getQuestion(id: string) {
    return this.data.find((q) => String(q.id) === id) ?? null;
  }
  async listQuestions(p: { cursor?: string; limit?: number; curriculumIds?: string[] }) {
    return pageOf(this.data, p);
  }
  async getCurriculum() {
    return snapshotCurriculum();
  }
}

/** Import of a JSON export of Noon QuestionDTOs produced by an authorized operator. */
export class FileQuestionBankProvider implements NoonQuestionBankProvider {
  readonly id = "file" as const;
  readonly capabilities: ProviderCapabilities = { search: true, details: true, curriculum: "snapshot", ...NO_EXTRAS };
  readonly unavailableReason = null;
  constructor(private readonly data: NoonQuestionDTO[]) {}
  async getQuestion(id: string) {
    return this.data.find((q) => String(q.id) === id) ?? null;
  }
  async listQuestions(p: { cursor?: string; limit?: number; curriculumIds?: string[] }) {
    return pageOf(this.data, p);
  }
  async getCurriculum() {
    return snapshotCurriculum();
  }
}

export type HttpConfig = {
  baseUrl?: string;
  token?: string;
  /** Search endpoint path. Not documented publicly — must be supplied by Noon. */
  searchPath?: string;
  /** Detail path; Noon's own tooling documents GET /questions/{id}. */
  detailPath: string;
  curriculumPath?: string;
  subjectId: number;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
};

/**
 * Noon question-bank API. Only GET /questions/{id} is documented to us; the search and
 * curriculum paths and the auth scheme must be confirmed by Noon. Missing config → fail closed.
 */
export class HttpQuestionBankProvider implements NoonQuestionBankProvider {
  readonly id = "http" as const;
  readonly capabilities: ProviderCapabilities;
  readonly unavailableReason: string | null;
  constructor(private readonly cfg: HttpConfig) {
    const missing = [!cfg.baseUrl && "NOON_QB_BASE_URL", !cfg.token && "NOON_QB_TOKEN", !cfg.searchPath && "NOON_QB_SEARCH_PATH"].filter(Boolean);
    this.unavailableReason = missing.length ? `Not configured: ${missing.join(", ")}` : null;
    this.capabilities = { search: !!cfg.searchPath, details: true, curriculum: cfg.curriculumPath ? "api" : "snapshot", ...NO_EXTRAS };
  }
  private async get(path: string, query?: Record<string, string>) {
    if (this.unavailableReason) throw new Error(this.unavailableReason);
    const url = new URL(path, this.cfg.baseUrl!.replace(/\/?$/, "/"));
    if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.cfg.timeoutMs);
    try {
      const res = await (this.cfg.fetchImpl ?? fetch)(url, {
        headers: { accept: "application/json", authorization: `Bearer ${this.cfg.token}` },
        signal: ctl.signal,
        cache: "no-store",
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Noon question bank ${url.pathname} → HTTP ${res.status}`);
      return res.json();
    } finally {
      clearTimeout(t);
    }
  }
  async getQuestion(id: string) {
    return (await this.get(this.cfg.detailPath.replace("{id}", encodeURIComponent(id)))) as NoonQuestionDTO | null;
  }
  async listQuestions(p: { cursor?: string; limit?: number; curriculumIds?: string[] }): Promise<QuestionPage> {
    const chapter = (p.curriculumIds ?? []).find((c) => c.startsWith("chapter:"))?.slice(8);
    const query: Record<string, string> = { page: p.cursor ?? "0", size: String(Math.min(100, p.limit ?? 100)), sort: "createdAt,ASC" };
    if (chapter) query.chapterId = chapter;
    else query.subjectId = String(this.cfg.subjectId);
    const json = (await this.get(this.cfg.searchPath!, query)) as { data?: NoonQuestionDTO[]; meta?: { page: number; totalPages: number; totalElements: number } };
    const meta = json?.meta;
    return {
      items: json?.data ?? [],
      nextCursor: meta && meta.page + 1 < meta.totalPages ? String(meta.page + 1) : null,
      total: meta?.totalElements ?? null,
    };
  }
  async getCurriculum() {
    // No documented curriculum endpoint for this integration → bundled snapshot.
    return snapshotCurriculum();
  }
}

/** No source configured: everything fails closed. */
export class NoQuestionBankProvider implements NoonQuestionBankProvider {
  readonly id = "none" as const;
  readonly capabilities: ProviderCapabilities = { search: false, details: false, curriculum: "snapshot", ...NO_EXTRAS };
  constructor(readonly unavailableReason: string = "No Noon question-bank source configured") {}
  async getQuestion() {
    return null;
  }
  async listQuestions(): Promise<QuestionPage> {
    throw new Error(this.unavailableReason);
  }
  async getCurriculum() {
    return snapshotCurriculum();
  }
}
