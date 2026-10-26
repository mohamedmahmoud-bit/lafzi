import { describe, expect, it } from "vitest";
import { parseVocabularyCsv } from "@/features/admin/csv-import";
import { parseCsv } from "@/lib/csv";

describe("CSV import", () => {
  it("parses quoted fields, CRLF and BOM, preserving Arabic", () => {
    expect(parseCsv('﻿a,b\r\n"جسور، شجاع","قال ""نعم"""\r\n')).toEqual([
      ["a", "b"],
      ["جسور، شجاع", 'قال "نعم"'],
    ]);
  });
  it("validates rows and reports line numbers", () => {
    const csv = [
      "word,meaning,synonyms,antonyms,example,difficulty,category",
      "مقدام,شجاع,شجاع|جسور,جبان,كان مقدام القوم.,2,صفات",
      ",بلا كلمة,x,,مثال طويل,2,",
    ].join("\n");
    const { rows } = parseVocabularyCsv(csv);
    expect(rows[0]).toMatchObject({
      ok: true,
      line: 2,
      value: { word: "مقدام", synonyms: ["شجاع", "جسور"], difficulty: 2 },
    });
    expect(rows[1]).toMatchObject({ ok: false, line: 3 });
  });
  it("rejects files missing required columns", () => {
    expect(parseVocabularyCsv("word,meaning\nا,ب").headerError).toBeDefined();
  });
});
