/**
 * Parse teacher-written question sets (Markdown tables or CSV). The text is kept exactly as written;
 * nothing is generated. Expected columns (any order):
 *   السؤال | أ | ب | ج | د | الإجابة | الشرح | القسم | الصعوبة
 * «الإجابة» may be a letter (أ/ب/ج/د, a–d, 1–4) or the exact text of the right option.
 * A «## عنوان» heading above a table can set the section (القسم) for its rows.
 */
import { readCsv } from "@/features/lexicon/dataset";
import { isPlaceholder, meaningKey } from "@/features/lexicon/normalize";

export type QuestionRow = {
  rowNumber: number;
  raw: Record<string, string>;
  stem: string;
  options: string[];
  answer: string | null;
  explanation: string | null;
  section: string | null;
  difficulty: number | null;
};

const H = (h: string) => h.trim().toLowerCase();
const STEM = ["السؤال", "نص السؤال", "question", "stem"];
const OPTS = [
  ["أ", "ا", "الخيار أ", "الخيار 1", "1", "a", "option a", "option1"],
  ["ب", "الخيار ب", "الخيار 2", "2", "b", "option b", "option2"],
  ["ج", "الخيار ج", "الخيار 3", "3", "c", "option c", "option3"],
  ["د", "الخيار د", "الخيار 4", "4", "d", "option d", "option4"],
];
const ANSWER = ["الإجابة", "الاجابة", "الإجابة الصحيحة", "answer", "correct"];
const EXPL = ["الشرح", "التفسير", "explanation"];
const SECTION = ["القسم", "الفئة", "التصنيف", "section", "category"];
const DIFF = ["الصعوبة", "difficulty", "المستوى"];

const val = (v: string | undefined) => (isPlaceholder(v) ? null : v!.trim());

function toRow(n: number, headers: string[], cells: string[], section: string | null): QuestionRow | null {
  const raw: Record<string, string> = {};
  headers.forEach((h, i) => (raw[h] = (cells[i] ?? "").trim()));
  const get = (names: string[]) => {
    const i = headers.findIndex((h) => names.includes(H(h)));
    return i >= 0 ? val(cells[i]) : null;
  };
  const stem = get(STEM);
  if (!stem) return null;
  const options = OPTS.map((names) => get(names)).filter((x): x is string => !!x);
  const d = Number(get(DIFF));
  return {
    rowNumber: n,
    raw,
    stem,
    options,
    answer: get(ANSWER),
    explanation: get(EXPL),
    section: get(SECTION) ?? section,
    difficulty: Number.isInteger(d) && d >= 1 && d <= 3 ? d : null,
  };
}

const splitCells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

export function parseQuestionMarkdown(text: string): QuestionRow[] {
  const out: QuestionRow[] = [];
  let section: string | null = null;
  let headers: string[] | null = null;
  let n = 0;
  for (const line of text.split(/\r?\n/)) {
    const h = line.match(/^#{2,3}\s+(.+?)\s*(\(\s*\d+\s*\))?\s*$/);
    if (h) {
      section = h[1].trim();
      headers = null;
      continue;
    }
    if (!line.trim().startsWith("|")) {
      if (line.trim()) headers = null;
      continue;
    }
    const cells = splitCells(line);
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    if (!headers) {
      headers = cells;
      continue;
    }
    n++;
    const r = toRow(n, headers, cells, section);
    if (r) out.push(r);
  }
  return out;
}

export function parseQuestionCsv(text: string): QuestionRow[] {
  const [headers, ...body] = readCsv(text.replace(/^\uFEFF/, ""));
  if (!headers) return [];
  return body.map((cells, i) => toRow(i + 1, headers.map((h) => h.trim()), cells, null)).filter((r): r is QuestionRow => r !== null);
}

/** Resolve «الإجابة» to an option index (letter, digit or exact text). */
export function answerIndex(answer: string | null, options: string[]): number {
  if (!answer) return -1;
  const a = answer.trim().replace(/[)\].:]/g, "").trim();
  const letters = ["أ", "ب", "ج", "د"];
  const latin = ["a", "b", "c", "d"];
  if (letters.includes(a)) return letters.indexOf(a);
  if (a === "ا") return 0;
  if (latin.includes(a.toLowerCase())) return latin.indexOf(a.toLowerCase());
  if (/^[1-4]$/.test(a)) return Number(a) - 1;
  return options.findIndex((o) => meaningKey(o) === meaningKey(a));
}
