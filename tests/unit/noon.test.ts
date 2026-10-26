import { describe, expect, it, vi } from "vitest";
import { chooseFocusSkill } from "@/features/noon-integration/focus";
import {
  HttpNoonLearningIntegration,
  NoHeatmapIntegration,
} from "@/features/noon-integration/http";
import { MockNoonLearningIntegration } from "@/features/noon-integration/mock";
import {
  buildNoonPracticeUrl,
  DEV_PLACEHOLDER_PATH,
  noonGoHref,
} from "@/features/noon-integration/urls";
import type { SkillSummaryResult } from "@/features/noon-integration/types";

const ctx = { userId: "u1", noonStudentId: "N-1" };

describe("Noon deep links", () => {
  it("uses the configured template with mapped skill ids", () => {
    const url = buildNoonPracticeUrl(
      {
        practiceUrlTemplate: "https://noon.example/p/{skillId}?s={studentId}",
        skillIdMap: { verbal_analogy: "S 77" },
      },
      "N-1",
      "verbal_analogy",
    );
    expect(url).toBe("https://noon.example/p/S%2077?s=N-1");
  });
  it("falls back to the heat-map URL, then to the dev placeholder", () => {
    expect(
      buildNoonPracticeUrl({ heatmapUrl: "https://noon.example/me" }, "N-1", "verbal_analogy"),
    ).toBe("https://noon.example/me");
    expect(buildNoonPracticeUrl({}, "N-1", "verbal_analogy")).toBe(
      `${DEV_PLACEHOLDER_PATH}?skill=verbal_analogy`,
    );
  });
  it("refuses non-https templates (no javascript:/http redirects)", () => {
    expect(
      buildNoonPracticeUrl(
        { practiceUrlTemplate: "javascript:alert(1)//{skillId}" },
        "N-1",
        "verbal_analogy",
      ),
    ).toBe(`${DEV_PLACEHOLDER_PATH}?skill=verbal_analogy`);
  });
  it("tracking href only carries known params", () => {
    expect(noonGoHref("dashboard", "sentence_completion")).toBe(
      "/go/noon?src=dashboard&skill=sentence_completion",
    );
  });
});

describe("Noon learning adapters — fallback behaviour", () => {
  it("mock data is always labelled as development data", async () => {
    const r = await new MockNoonLearningIntegration({}).getStudentSkillSummary(ctx);
    expect(r.status).toBe("available");
    if (r.status === "available") expect(r.isDevelopmentData).toBe(true);
  });
  it("'none' adapter reports unavailable instead of inventing data", async () => {
    expect(await new NoHeatmapIntegration({}).getStudentSkillSummary()).toEqual({
      status: "unavailable",
      reason: "not_configured",
    });
  });
  it("http adapter without a base URL or spec is unavailable (never throws)", async () => {
    expect(
      (
        await new HttpNoonLearningIntegration({ timeoutMs: 50, urls: {} }).getStudentSkillSummary(
          ctx,
        )
      ).status,
    ).toBe("unavailable");
    const pending = new HttpNoonLearningIntegration({
      baseUrl: "https://api.example",
      timeoutMs: 50,
      urls: {},
    });
    expect(await pending.getStudentSkillSummary(ctx)).toEqual({
      status: "unavailable",
      reason: "not_configured",
    });
  });

  class Configured extends HttpNoonLearningIntegration {
    protected skillSummaryPath(id: string) {
      return `/s/${id}`;
    }
    protected mapNoonSkills(json: unknown) {
      return (json as { id: "verbal_analogy"; m: number }[]).map((s) => ({
        skillId: s.id,
        name: "x",
        mastery: s.m,
        level: "good" as const,
      }));
    }
  }
  it("returns unavailable on HTTP errors, timeouts and network failures", async () => {
    const make = (impl: typeof fetch) =>
      new Configured({ baseUrl: "https://api.example", timeoutMs: 20, urls: {}, fetchImpl: impl });
    expect(
      (await make(vi.fn(async () => new Response("", { status: 500 }))).getStudentSkillSummary(ctx))
        .status,
    ).toBe("unavailable");
    expect(
      (
        await make(
          vi.fn(async () => {
            throw new Error("ECONNRESET");
          }),
        ).getStudentSkillSummary(ctx)
      ).status,
    ).toBe("unavailable");
    const hang = vi.fn(
      (_u: unknown, init?: RequestInit) =>
        new Promise<Response>((_, rej) =>
          init?.signal?.addEventListener("abort", () => rej(new Error("aborted"))),
        ),
    );
    expect((await make(hang as unknown as typeof fetch).getStudentSkillSummary(ctx)).status).toBe(
      "unavailable",
    );
    expect(
      (
        await make(
          vi.fn(async () => Response.json([{ id: "verbal_analogy", m: 40 }])),
        ).getStudentSkillSummary(ctx)
      ).status,
    ).toBe("available");
  });
});

describe("chooseFocusSkill", () => {
  const available: SkillSummaryResult = {
    status: "available",
    source: "noon",
    isDevelopmentData: false,
    fetchedAt: "",
    skills: [
      { skillId: "verbal_analogy", name: "التناظر اللفظي", mastery: 76, level: "good" },
      { skillId: "sentence_completion", name: "إكمال الجمل", mastery: 42, level: "needs_practice" },
    ],
  };
  it("prefers Noon's weakest skill", () => {
    expect(chooseFocusSkill(available, [])).toMatchObject({
      skillId: "sentence_completion",
      basis: "noon",
    });
  });
  it("uses the honest local signal when Noon is unavailable", () => {
    const r = chooseFocusSkill({ status: "unavailable", reason: "error" }, [
      { skillId: "verbal_analogy", answered: 8, accuracy: 0.5 },
    ]);
    expect(r).toMatchObject({ skillId: "verbal_analogy", basis: "local" });
  });
  it("ignores thin local evidence and returns null (generic CTA) rather than faking a weakness", () => {
    expect(
      chooseFocusSkill({ status: "unavailable", reason: "error" }, [
        { skillId: "verbal_analogy", answered: 2, accuracy: 0 },
      ]),
    ).toBeNull();
  });
});
