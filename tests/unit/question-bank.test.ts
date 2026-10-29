import { describe, expect, it } from "vitest";
import { contentHash, correctnessHash, htmlToText, normalizeDTO } from "@/features/question-bank/normalize";
import { MockQuestionBankProvider, NoQuestionBankProvider, HttpQuestionBankProvider } from "@/features/question-bank/providers";
import { buildMockQuestions } from "@/features/question-bank/providers/mock-data";
import type { NoonQuestionDTO } from "@/features/question-bank/types";
import { validateQuestion, type ValidationContext } from "@/features/question-bank/validation";

const ctx: ValidationContext = {
  topicForChapter: (c) => ({ 2854: "verbal_analogy", 2856: "sentence_completion", 2855: "reading_comprehension" })[c] ?? null,
  subskillForSubtopic: (s) => `st_${s}`,
  playableTopics: new Set(["verbal_analogy", "sentence_completion"]),
  duplicateOf: null,
  isMock: false,
  isProduction: true,
  verbalSubjectId: 249,
};
const analogy = (): NoonQuestionDTO => ({
  id: 1234,
  text: "شجاع : جسور",
  type: "mcq",
  choices: [
    { id: 1, text: "كريم : سخي" },
    { id: 2, text: "بخيل : كريم" },
    { id: 3, text: "قلم : كاتب" },
    { id: 4, text: "بحر : موج" },
  ],
  correctChoiceId: 1,
  correctChoiceIds: [1],
  suitableForPractice: true,
  reportStatus: "RESOLVED",
  difficultyLevel: 2,
  additionalMaterials: [{ id: 9, type: "explanation", content: "<p>العلاقة هنا هي: ترادف</p>" }],
  curriculum: [{ subjectId: 249, chapterId: 2854, subtopicId: 1646, concept: { name: "الترادف" } }],
});

describe("normalize", () => {
  it("turns Noon HTML into plain text without tags or entities", () => {
    expect(htmlToText('<p dir="rtl">أ&nbsp;ب</p><p>ج<br>د</p>')).toBe("أ ب\nج\nد");
  });
  it("hashes: explanation edits change content but not correctness", () => {
    const a = normalizeDTO(analogy());
    const b = normalizeDTO({ ...analogy(), additionalMaterials: [{ id: 9, type: "explanation", content: "شرح آخر" }] });
    expect(contentHash(a)).not.toBe(contentHash(b));
    expect(correctnessHash(a)).toBe(correctnessHash(b));
    const c = normalizeDTO({ ...analogy(), correctChoiceId: 2, correctChoiceIds: [2] });
    expect(correctnessHash(a)).not.toBe(correctnessHash(c));
  });
  it("never invents an explanation", () => {
    expect(normalizeDTO({ ...analogy(), additionalMaterials: [] }).explanation).toBeNull();
  });
});

describe("validation", () => {
  it("a clean Noon analogy question is ready (publishing is still a decision)", () => {
    const r = validateQuestion(normalizeDTO(analogy()), ctx);
    expect(r.outcome).toBe("ready");
    expect(r.topicId).toBe("verbal_analogy");
    expect(r.subskillId).toBe("st_1646");
  });
  it("rejects missing answers, duplicates options, multi-select and mock-in-production", () => {
    expect(validateQuestion(normalizeDTO({ ...analogy(), correctChoiceId: null, correctChoiceIds: [] }), ctx).outcome).toBe("rejected");
    expect(validateQuestion(normalizeDTO({ ...analogy(), choices: [{ id: 1, text: "أ : ب" }, { id: 2, text: "أ : ب" }] }), ctx).outcome).toBe("rejected");
    expect(validateQuestion(normalizeDTO({ ...analogy(), isMultiSelect: true }), ctx).outcome).toBe("rejected");
    expect(validateQuestion(normalizeDTO(analogy()), { ...ctx, isMock: true }).outcome).toBe("rejected");
  });
  it("does not trust the tag alone: a non-pair stem tagged as analogy needs review", () => {
    expect(validateQuestion(normalizeDTO({ ...analogy(), text: "اختر الكلمة المناسبة" }), ctx).outcome).toBe("review_required");
  });
  it("reading questions without their passage are rejected", () => {
    const r = validateQuestion(normalizeDTO({ ...analogy(), curriculum: [{ subjectId: 249, chapterId: 2855, subtopicId: 1 }] }), ctx);
    expect(r.results.find((x) => x.check === "passage_dependency")?.passed).toBe(false);
    expect(r.outcome).toBe("rejected");
  });
  it("flags duplicates and open reports for review", () => {
    expect(validateQuestion(normalizeDTO(analogy()), { ...ctx, duplicateOf: 77 }).outcome).toBe("review_required");
    expect(validateQuestion(normalizeDTO({ ...analogy(), reportStatus: "OPEN" }), ctx).outcome).toBe("review_required");
  });
});

describe("providers", () => {
  it("mock data is unmistakably labelled and uses a reserved id range", () => {
    for (const q of buildMockQuestions()) {
      expect(q.text).toMatch(/^\(تجريبي\)/);
      expect(q.id).toBeGreaterThan(990000);
    }
  });
  it("pages through a chapter", async () => {
    const p = new MockQuestionBankProvider();
    const first = await p.listQuestions({ limit: 5, curriculumIds: ["chapter:2854"] });
    expect(first.items).toHaveLength(5);
    expect(first.nextCursor).toBe("1");
  });
  it("fails closed when not configured", async () => {
    expect(new NoQuestionBankProvider().unavailableReason).toBeTruthy();
    await expect(new NoQuestionBankProvider().listQuestions()).rejects.toThrow();
    const http = new HttpQuestionBankProvider({ detailPath: "/questions/{id}", subjectId: 249, timeoutMs: 1000 });
    expect(http.unavailableReason).toMatch(/NOON_QB_BASE_URL/);
    await expect(http.listQuestions({})).rejects.toThrow();
  });
  it("http provider keeps the token in a header, never the URL", async () => {
    const seen: { url: string; auth: string | null }[] = [];
    const http = new HttpQuestionBankProvider({
      baseUrl: "https://qb.example.test",
      token: "secret-token",
      searchPath: "/questions/search",
      detailPath: "/questions/{id}",
      subjectId: 249,
      timeoutMs: 1000,
      fetchImpl: (async (u: URL, init: RequestInit) => {
        seen.push({ url: String(u), auth: new Headers(init.headers).get("authorization") });
        return new Response(JSON.stringify({ data: [], meta: { page: 0, totalPages: 1, totalElements: 0 } }));
      }) as unknown as typeof fetch,
    });
    await http.listQuestions({ curriculumIds: ["chapter:2854"] });
    expect(seen[0].url).not.toContain("secret-token");
    expect(seen[0].url).toContain("chapterId=2854");
    expect(seen[0].auth).toBe("Bearer secret-token");
  });
});
