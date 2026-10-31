import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsvDataset, parseMarkdownDataset } from "@/features/lexicon/dataset";
import { lexKey } from "@/features/lexicon/normalize";
import { summarize, validateRows } from "@/features/lexicon/validate";
import type { Lexicon } from "@/features/lexicon/content";
import { boardRounds, meaningRounds, oddOneOutRound, relationRound, unambiguousSet } from "@/features/games/vocab-builders";
import { profileUpdateSchema } from "@/features/profile/service";
import { seededRandom } from "@/lib/utils";

const md = readFileSync("data/vocabulary/lafzi-initial-427.md", "utf8");

describe("initial dataset", () => {
  const rows = parseMarkdownDataset(md);
  it("imports every one of the 427 source rows with its section", () => {
    expect(rows).toHaveLength(427);
    const by = (s: string) => rows.filter((r) => r.section.startsWith(s)).length;
    expect([by("مترادفات"), by("أضداد"), by("أصوات"), by("صغار"), by("مساكن"), by("جموع"), by("أفعال"), by("مفردات القدرات"), by("أزواج")]).toEqual([63, 15, 31, 18, 23, 14, 14, 235, 14]);
  });
  it("keeps the original text (raw cells) and maps placeholders to null", () => {
    const r = rows.find((x) => x.word === "أعانه")!;
    expect(r.raw["مثال"]).toBe("—");
    expect(r.example).toBeNull();
    expect(rows.find((x) => x.word === "القط" && x.section.startsWith("صغار"))!.related).toBe("هِرّ");
  });
  it("flags duplicates, inconsistent meanings and linguistic issues instead of fixing them", () => {
    const v = validateRows(rows);
    const flagged = (word: string, code: string) => v.some((r) => r.word === word && r.flags.some((f) => f.code === code));
    expect(flagged("مديد", "duplicate_row")).toBe(true);
    expect(flagged("يراع", "inconsistent_meaning")).toBe(true);
    expect(flagged("الإفراط", "spelling_variant")).toBe(true);
    expect(flagged("دب", "linguistic_review")).toBe(true); // دببة is a plural, not the female
    expect(flagged("القط", "linguistic_review")).toBe(true); // هِرّ / الأفحوص
    expect(flagged("الرعد", "multiple_related")).toBe(true);
    const s = summarize(v);
    expect(s.total).toBe(427);
    expect(s.clean + s.flagged).toBe(427);
    // Untouched rows stay exactly as supplied.
    const ok = v.find((r) => r.word === "الأسد" && r.relationType === "sound")!;
    expect(ok.status).toBe("staged");
    expect(ok.related).toBe("زئير");
  });
  it("relations are typed and directional — أسد → زئير is a sound, not a synonym", () => {
    const v = validateRows(rows);
    expect(v.find((r) => r.word === "الأسد" && r.related === "زئير")!.relationType).toBe("sound");
    expect(v.find((r) => r.word === "كتب" && r.related === "يكتب")!.relationType).toBe("verb_present");
  });
  it("reads CSV with a section column", () => {
    const csv = 'الكلمة,المعنى,نوع العلاقة,كلمة مرتبطة,مثال,القسم\nالأسد,حيوان,صوت,زئير,"سمعنا زئير الأسد، ليلًا",أصوات الحيوانات\n';
    const r = parseCsvDataset(csv);
    expect(r).toHaveLength(1);
    expect(r[0].example).toBe("سمعنا زئير الأسد، ليلًا");
    expect(validateRows(r)[0].categoryId).toBe("vo_animal_sound");
  });
  it("lexical key unifies diacritics, hamza forms and a leading «ال»", () => {
    expect(lexKey("الأسد")).toBe(lexKey("أسد"));
    expect(lexKey("مُهر")).toBe(lexKey("مهر"));
    expect(lexKey("الإفراط")).toBe(lexKey("إفراط"));
  });
});

// A tiny approved lexicon for builder tests.
function lexicon(): Lexicon {
  const words = ["الأسد", "زئير", "شبل", "عرين", "الأرنب", "خرنق", "جحر", "الفأر", "الأفعى", "القط", "مواء", "الكلب", "نباح", "جرو", "الحصان", "صهيل", "مهر", "إسطبل", "الحمار", "نهيق", "جحش", "سعيد", "فرح", "حزين", "كئيب", "شجاع", "جريء"];
  const entries = new Map(words.map((w, i) => [`e${i}`, { id: `e${i}`, lemma: w, difficulty: 2, categories: [] as string[] }]));
  const id = (w: string) => [...entries.values()].find((e) => e.lemma === w)!.id;
  let n = 0;
  const rel = (type: string, a: string, b: string) => ({ id: `r${n++}`, type: type as never, fromId: id(a), toId: id(b), example: null });
  return {
    entries,
    senses: [
      ["سعيد", "مسرور"], ["حزين", "كئيب النفس"], ["شجاع", "مقدام"], ["الأسد", "حيوان مفترس"], ["القط", "حيوان أليف"], ["الحصان", "حيوان للركوب"],
    ].map(([w, m], i) => ({ id: `s${i}`, entryId: id(w), meaning: m, example: null, difficulty: 2 })),
    relations: [
      rel("sound", "الأسد", "زئير"), rel("sound", "القط", "مواء"), rel("sound", "الكلب", "نباح"), rel("sound", "الحصان", "صهيل"), rel("sound", "الحمار", "نهيق"),
      rel("animal_young", "الأسد", "شبل"), rel("animal_young", "الأرنب", "خرنق"), rel("animal_young", "الكلب", "جرو"), rel("animal_young", "الحصان", "مهر"), rel("animal_young", "الحمار", "جحش"),
      rel("animal_home", "الأسد", "عرين"), rel("animal_home", "الأرنب", "جحر"), rel("animal_home", "الفأر", "جحر"), rel("animal_home", "الأفعى", "جحر"), rel("animal_home", "الحصان", "إسطبل"),
      rel("synonym", "سعيد", "فرح"), rel("synonym", "حزين", "كئيب"), rel("synonym", "شجاع", "جريء"), rel("antonym", "سعيد", "حزين"),
    ],
  };
}

describe("game builders use approved content only and avoid ambiguity", () => {
  it("never puts two lefts on a board that share a right (جحر fits الأرنب/الفأر/الأفعى)", () => {
    for (let seed = 1; seed < 40; seed++) {
      const set = unambiguousSet(lexicon(), "animal_home", 3, seededRandom(seed));
      const rights = set.map((r) => r.toId);
      expect(new Set(rights).size).toBe(rights.length);
    }
  });
  it("match board: one right per left, every right is an approved answer", () => {
    const lx = lexicon();
    const rounds = boardRounds(lx, "sound", 5, seededRandom(3), "match");
    expect(rounds).toHaveLength(5);
    for (const r of rounds) {
      expect(r.choices.map((c) => c.id)).toContain(r.correctId);
      expect(lx.relations.some((x) => x.type === "sound" && x.toId === r.correctId && lx.entries.get(x.fromId)!.lemma === r.stem)).toBe(true);
    }
  });
  it("relation question distractors are never valid answers for the word", () => {
    const lx = lexicon();
    for (const rel of lx.relations.filter((r) => r.type === "animal_home")) {
      const q = relationRound(lx, rel, seededRandom(5));
      if (!q) continue;
      const valid = new Set(lx.relations.filter((r) => r.type === "animal_home" && r.fromId === rel.fromId).map((r) => r.toId));
      expect(q.choices.filter((c) => valid.has(c.id))).toHaveLength(1);
    }
  });
  it("meaning rounds never use a synonym's meaning as a distractor", () => {
    const lx = lexicon();
    lx.senses.push({ id: "sx", entryId: [...lx.entries.values()].find((e) => e.lemma === "فرح")!.id, meaning: "مبتهج", example: null, difficulty: 2 });
    for (let seed = 1; seed < 20; seed++) {
      for (const r of meaningRounds(lx, { n: 6, rand: seededRandom(seed) })) {
        if (r.stem === "سعيد") expect(r.choices.map((c) => c.text)).not.toContain("مبتهج");
      }
    }
  });
  it("odd-one-out: the outlier belongs to another group and explains itself", () => {
    const r = oddOneOutRound(lexicon(), seededRandom(9))!;
    expect(r).toBeTruthy();
    expect(r.choices).toHaveLength(4);
    expect(r.explanation).toContain(r.choices.find((c) => c.id === r.correctId)!.text);
  });
});

describe("profile updates", () => {
  it("accept avatar/privacy and reject any name field", () => {
    expect(profileUpdateSchema.safeParse({ avatar: "owl", shareScores: true }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ displayName: "أي اسم" }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ officialFullName: "x" }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ avatar: "https://evil/x.png" }).success).toBe(false);
  });
});
