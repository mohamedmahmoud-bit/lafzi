import { parseCsv, splitList } from "@/lib/csv";
import { CSV_COLUMNS, wordInputSchema, type WordInput } from "./word-input";

export type CsvRowResult =
  { line: number; ok: true; value: WordInput } | { line: number; ok: false; error: string };

/** Parse + validate a vocabulary CSV. Pure — persistence is done by the caller. */
export function parseVocabularyCsv(text: string): { rows: CsvRowResult[]; headerError?: string } {
  const table = parseCsv(text);
  if (!table.length) return { rows: [], headerError: "الملف فارغ" };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const missing = CSV_COLUMNS.filter((c) => c !== "category" && !header.includes(c));
  if (missing.length) return { rows: [], headerError: `أعمدة ناقصة: ${missing.join(", ")}` };
  const col = (r: string[], name: string) => r[header.indexOf(name)] ?? "";

  const rows = table.slice(1).map((r, i): CsvRowResult => {
    const parsed = wordInputSchema.safeParse({
      word: col(r, "word"),
      meaning: col(r, "meaning"),
      synonyms: splitList(col(r, "synonyms")),
      antonyms: splitList(col(r, "antonyms")),
      example: col(r, "example"),
      difficulty: col(r, "difficulty") || 2,
      category: col(r, "category"),
    });
    return parsed.success
      ? { line: i + 2, ok: true, value: parsed.data }
      : { line: i + 2, ok: false, error: parsed.error.issues.map((x) => x.message).join("، ") };
  });
  return { rows };
}
