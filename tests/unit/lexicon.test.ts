import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsvDataset, parseMarkdownDataset } from "@/features/lexicon/dataset";
import { lexKey } from "@/features/lexicon/normalize";
import { RELATION_CATEGORY, RELATION_LABEL, SECTION_CATEGORY } from "@/features/lexicon/mapping";
import { summarize, validateRows } from "@/features/lexicon/validate";
import type { Lexicon } from "@/features/lexicon/content";
import { boardRounds, meaningRounds, relationForCategory, relationRounds, unambiguousSet } from "@/features/games/vocab-builders";
import { answerIndex, parseQuestionCsv, parseQuestionMarkdown } from "@/features/questions/parse";
import { validateQuestions } from "@/features/questions/service";
import { extractCandidates, wordsOf } from "@/features/bank-words/extract";
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

describe("word-pair boards use approved pairs only and avoid ambiguity", () => {
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
});



describe("profile updates", () => {
  it("accept avatar/privacy and reject any name field", () => {
    expect(profileUpdateSchema.safeParse({ avatar: "owl", shareScores: true }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ displayName: "أي اسم" }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ officialFullName: "x" }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ avatar: "https://evil/x.png" }).success).toBe(false);
  });
});

describe("teacher questions (the only multiple-choice source)", () => {
  const md = `## مفردات القدرات
| السؤال | أ | ب | ج | د | الإجابة | الشرح |
|---|---|---|---|---|---|---|
| ما معنى «الدَّيْجُور»؟ | شدة الظلام | ضوء الفجر | الريح | المطر | أ | الظلام الشديد |
| ما ضد «جبان»؟ | خائف | شجاع | ضعيف | — | شجاع | — |
| سؤال بلا إجابة | س | ص | — | — | — | — |
| سؤال مكرر | س | ص | — | — | ب | — |
| سؤال مكرر | س | ص | — | — | ب | — |`;
  it("keeps the teacher's text, resolves letter or text answers, and takes the section from the heading", () => {
    const rows = parseQuestionMarkdown(md);
    expect(rows).toHaveLength(5);
    expect(rows[0].stem).toBe("ما معنى «الدَّيْجُور»؟");
    expect(rows[0].section).toBe("مفردات القدرات");
    expect(answerIndex("أ", rows[0].options)).toBe(0);
    expect(answerIndex("شجاع", rows[1].options)).toBe(1);
    expect(answerIndex("2", ["x", "y"])).toBe(1);
  });
  it("flags missing answers and duplicates; never invents anything", () => {
    const v = validateQuestions(parseQuestionMarkdown(md), (s) => (s === "مفردات القدرات" ? "vo_qudurat" : null));
    expect(v[0].status).toBe("staged");
    expect(v[0].correctId).toBe("أ");
    expect(v[0].categoryId).toBe("vo_qudurat");
    expect(v[1].choices).toHaveLength(3); // the «—» option is dropped, nothing added
    expect(v[2].flags.map((f) => f.code)).toContain("missing_answer");
    expect(v[4].flags.map((f) => f.code)).toContain("duplicate_question");
  });
  it("reads CSV", () => {
    const rows = parseQuestionCsv('السؤال,أ,ب,الإجابة,القسم\n"ما معنى «وَجَم»، باختصار؟",سكت حزنًا,ضحك,أ,مفردات القدرات\n');
    expect(rows[0].stem).toBe("ما معنى «وَجَم»، باختصار؟");
    expect(rows[0].options).toEqual(["سكت حزنًا", "ضحك"]);
  });
  it("relation categories practise with boards", () => {
    expect(relationForCategory("vo_animal_sound")).toBe("sound");
    expect(relationForCategory("vo_qudurat")).toBeNull();
  });
});

describe("words from the bank", () => {
  it("prefers rare question-target words and skips function words", () => {
    expect(wordsOf("هو في البيت")).toEqual(["البيت"]);
    const texts = [
      { noonQuestionId: 1, topic: "verbal_analogy", stem: "أتراح : أفراح", choices: ["أجداث : قبور", "شمس : قمر"], passage: null },
      ...Array.from({ length: 10 }, (_, i) => ({ noonQuestionId: 100 + i, topic: null, stem: "الشمس تشرق في الصباح", choices: [], passage: null })),
    ];
    const c = extractCandidates(texts, new Set());
    const lemmas = c.map((x) => x.lemma);
    expect(lemmas.slice(0, 4)).toEqual(expect.arrayContaining(["أتراح", "أجداث"]));
    expect(lemmas).not.toContain("الشمس"); // frequent everyday word
    expect(lemmas).not.toContain("في");
  });
});

/** A dictionary built from the real 427-row dataset (sections → categories, typed pairs, meanings). */
function datasetLexicon(): Lexicon {
  const rows = parseMarkdownDataset(readFileSync("data/vocabulary/lafzi-initial-427.md", "utf8"));
  const entries: Lexicon["entries"] = new Map();
  const ent = (w: string, cat: string) => {
    const k = lexKey(w);
    const e = entries.get(k) ?? { id: k, lemma: w, difficulty: 2, categories: [] as string[] };
    if (!e.categories.includes(cat)) e.categories.push(cat);
    entries.set(k, e);
    return k;
  };
  const senses: Lexicon["senses"] = [];
  const relations: Lexicon["relations"] = [];
  for (const r of rows) {
    const cat = SECTION_CATEGORY[r.section.replace(/\(\s*\d+\s*\)/, "").trim()] ?? "vo_qudurat";
    const id = ent(r.word, cat);
    if (r.meaning && r.meaning !== "—") senses.push({ id: `s${r.rowNumber}`, entryId: id, meaning: r.meaning, example: null, difficulty: 2 } as never);
    const type = r.relationLabel ? RELATION_LABEL[r.relationLabel] : null;
    if (type && r.related && r.related !== "—") relations.push({ id: `r${r.rowNumber}`, type, fromId: id, toId: ent(r.related, RELATION_CATEGORY[type]), example: r.example } as never);
  }
  return { entries, senses, relations } as Lexicon;
}

describe("practising one category (dictionary fallback)", () => {
  it("animal sounds ask «ما اسم صوت …؟» and every option is an approved sound that is wrong for that animal", () => {
    const lx = datasetLexicon();
    for (let seed = 1; seed <= 20; seed++) {
      const rounds = relationRounds(lx, "sound", { n: 20, rand: seededRandom(seed) });
      expect(rounds.length).toBeGreaterThanOrEqual(10);
      for (const r of rounds) {
        expect(r.kind).toBe("relation");
        expect(r.subskillId).toBe("vo_animal_sound");
        expect(r.choices).toHaveLength(4);
        const animal = r.entryIds![0];
        const validForAnimal = new Set(lx.relations.filter((x) => x.type === "sound" && x.fromId === animal).map((x) => x.toId));
        const sounds = new Set(lx.relations.filter((x) => x.type === "sound").map((x) => x.toId));
        const words = (t: string) => lexKey(t).split(/[\s،,/]+/).map((x) => x.replace(/^و(?=...)/, ""));
        const right = new Set(r.choices.filter((c) => validForAnimal.has(c.id)).flatMap((c) => words(c.text)));
        for (const ch of r.choices) {
          if (ch.id !== r.correctId) expect(words(ch.text).some((w) => right.has(w))).toBe(false); // «نعيق ونعيب» never beside «نعيق»
          expect(sounds.has(ch.id)).toBe(true);
          expect(validForAnimal.has(ch.id)).toBe(ch.id === r.correctId);
        }
      }
    }
  });
  it("a meaning category keeps all four options inside that category", () => {
    const lx = datasetLexicon();
    const rounds = meaningRounds(lx, { n: 10, category: "vo_qudurat", rand: seededRandom(3) });
    expect(rounds.length).toBe(10);
    const owner = new Map(lx.senses.map((x) => [x.id, x.entryId]));
    for (const r of rounds) for (const ch of r.choices) expect(lx.entries.get(owner.get(ch.id)!)!.categories).toContain("vo_qudurat");
  });
});
