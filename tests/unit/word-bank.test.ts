import { describe, expect, it } from "vitest";
import { normalizeDTO } from "@/features/question-bank/normalize";
import type { NoonQuestionDTO } from "@/features/question-bank/types";
import { canApproveRelationship, extractCandidates, isCorroborated, meaningSupported } from "@/features/word-bank/extraction";

const q = (over: Partial<NoonQuestionDTO> = {}) =>
  normalizeDTO({
    id: 1,
    text: "شجاع : جسور",
    type: "mcq",
    choices: [
      { id: 1, text: "كريم : سخي" },
      { id: 2, text: "بخيل : كريم" },
    ],
    correctChoiceIds: [1],
    additionalMaterials: [{ id: 2, type: "explanation", content: "✅ كريم : سخي ↜ العلاقة هنا هي: ترادف" }],
    curriculum: [{ subjectId: 249, chapterId: 2854, concept: { name: "الترادف" } }],
    ...over,
  });

describe("vocabulary extraction", () => {
  it("extracts the stem pair and the correct-answer pair, never distractors", () => {
    const c = extractCandidates(q());
    expect(c.map((x) => `${x.from.lemma}-${x.to.lemma}`)).toEqual(["شجاع-جسور", "كريم-سخي"]);
    expect(c.every((x) => x.type === "synonym")).toBe(true);
    expect(c.flatMap((x) => [x.from.lemma, x.to.lemma])).not.toContain("بخيل");
    expect(isCorroborated(c[0])).toBe(true);
  });
  it("creates nothing without a Noon-stated relation (co-occurrence is not evidence)", () => {
    expect(extractCandidates(q({ additionalMaterials: [], curriculum: [{ subjectId: 249, chapterId: 2854, concept: { name: "الجزء من كل" } }] }))).toEqual([]);
  });
  it("flags tag/explanation conflicts so they cannot be approved", () => {
    const c = extractCandidates(q({ additionalMaterials: [{ id: 2, type: "explanation", content: "العلاقة هنا هي: تضاد" }] }));
    expect(c[0].checks.find((x) => x.check === "no_conflict")?.passed).toBe(false);
  });
  it("antonyms come from Noon's «التضاد» concept", () => {
    const c = extractCandidates(q({ text: "ليل : نهار", additionalMaterials: [], curriculum: [{ subjectId: 249, chapterId: 2854, concept: { name: "التضاد والتقابل" } }] }));
    expect(c[0].type).toBe("antonym");
    expect(isCorroborated(c[0])).toBe(false); // single signal → still needs a human
  });
  it("approval needs Noon evidence; meanings must be quoted from Noon's explanation", () => {
    expect(canApproveRelationship([])).toBe(false);
    expect(canApproveRelationship([{ kind: "concept_tag" }])).toBe(true);
    expect(meaningSupported("الشجاع هو الجريء", "يقصد بها أنّ الشُّجاع هو الجريء في الموقف")).toBe(true);
    expect(meaningSupported("معنى مخترع", "يقصد بها أن الشجاع هو الجريء")).toBe(false);
    expect(meaningSupported("أي شيء", null)).toBe(false);
  });
});
