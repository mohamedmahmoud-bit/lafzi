import { isPlaceholder } from "./normalize";

export type SourceRow = {
  rowNumber: number;
  section: string;
  raw: Record<string, string>;
  word: string;
  meaning: string | null;
  relationLabel: string | null;
  related: string | null;
  example: string | null;
};

const HEADER_ALIASES: Record<string, keyof Omit<SourceRow, "rowNumber" | "section" | "raw">> = {
  الكلمة: "word",
  word: "word",
  المعنى: "meaning",
  meaning: "meaning",
  "نوع العلاقة": "relationLabel",
  العلاقة: "relationLabel",
  relation: "relationLabel",
  "كلمة مرتبطة": "related",
  "الكلمة المرتبطة": "related",
  related: "related",
  مثال: "example",
  المثال: "example",
  example: "example",
};

const clean = (v: string | undefined) => (isPlaceholder(v) ? null : v!.trim());

function toRow(rowNumber: number, section: string, headers: string[], cells: string[]): SourceRow | null {
  const raw: Record<string, string> = {};
  headers.forEach((h, i) => (raw[h] = (cells[i] ?? "").trim()));
  const pick: Partial<Record<string, string | null>> = {};
  headers.forEach((h, i) => {
    const k = HEADER_ALIASES[h.trim().toLowerCase()] ?? HEADER_ALIASES[h.trim()];
    if (k) pick[k] = clean(cells[i]);
  });
  if (!pick.word) return null;
  return {
    rowNumber,
    section,
    raw,
    word: pick.word,
    meaning: pick.meaning ?? null,
    relationLabel: pick.relationLabel ?? null,
    related: pick.related ?? null,
    example: pick.example ?? null,
  };
}

const splitCells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

/** Markdown with `## Section (n)` headings, each followed by a table. Row numbers are global, in file order. */
export function parseMarkdownDataset(text: string): SourceRow[] {
  const out: SourceRow[] = [];
  let section = "";
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
      if (line.trim()) headers = null; // any prose ends the current table
      continue;
    }
    const cells = splitCells(line);
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    if (!headers) {
      headers = cells;
      continue;
    }
    n++;
    const row = toRow(n, section, headers, cells);
    if (row) out.push(row);
  }
  return out;
}

/** CSV with a header row; a «القسم/section/category» column gives the section. */
export function parseCsvDataset(text: string): SourceRow[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      cur.push(field);
      field = "";
    }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      cur.push(field);
      if (cur.some((x) => x.trim())) rows.push(cur);
      cur = [];
      field = "";
    } else field += c;
  }
  cur.push(field);
  if (cur.some((x) => x.trim())) rows.push(cur);
  const [headers, ...body] = rows;
  if (!headers) return [];
  const secIdx = headers.findIndex((h) => ["القسم", "الفئة", "التصنيف", "section", "category"].includes(h.trim().toLowerCase()));
  return body
    .map((cells, i) => toRow(i + 1, secIdx >= 0 ? cells[secIdx]?.trim() ?? "" : "", headers, cells))
    .filter((r): r is SourceRow => r !== null);
}
