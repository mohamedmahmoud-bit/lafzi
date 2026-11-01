import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db, DbOrTx } from "@/db/client";
import { entryMedia, vocabularyEntries, vocabularyRelationships } from "@/db/schema";
import { lexKey } from "@/features/lexicon/normalize";
import { parseMediaCsv, validateMedia, type MediaInput } from "./parse";

export type ApprovedMedia = { id: string; kind: "image" | "audio" | "youtube"; url: string; youtubeId: string | null; startSec: number | null; endSec: number | null; credit: string | null };

/** Add one media item to a word (pending unless the reviewer approves it right away). */
export async function addMedia(db: DbOrTx, p: { entryId: string; input: MediaInput; addedBy: string | null; approve?: boolean }) {
  const v = validateMedia(p.input);
  if (!v.ok) throw new Error(v.error);
  const approved = !!p.approve;
  const [row] = await db
    .insert(entryMedia)
    .values({ entryId: p.entryId, ...v.value, addedBy: p.addedBy, status: approved ? "approved" : "pending", reviewedBy: approved ? p.addedBy : null, reviewedAt: approved ? new Date() : null })
    .onConflictDoNothing()
    .returning({ id: entryMedia.id });
  return { id: row?.id ?? null, duplicate: !row };
}

/** Published words by normalized key (merged duplicates resolved to their target). */
async function wordIndex(db: DbOrTx, words: string[]) {
  const keys = [...new Set(words.map(lexKey))];
  if (!keys.length) return new Map<string, string>();
  const rows = await db
    .select({ id: vocabularyEntries.id, normalized: vocabularyEntries.normalized })
    .from(vocabularyEntries)
    .where(and(inArray(vocabularyEntries.normalized, keys), eq(vocabularyEntries.status, "approved"), isNull(vocabularyEntries.mergedInto)));
  return new Map(rows.map((r) => [r.normalized, r.id]));
}

export type MediaImportReport = { added: number; duplicates: number; unknownWords: string[]; invalid: { rowNumber: number; word: string; error: string }[] };

/** Bulk import from CSV. Every item enters as pending; nothing reaches students until approved. */
export async function importMediaCsv(db: Db, text: string, addedBy: string | null): Promise<MediaImportReport> {
  const rows = parseMediaCsv(text);
  if (!rows.length) throw new Error("لم يُعثر على أي رابط في الملف");
  const idx = await wordIndex(db, rows.map((r) => r.word));
  const report: MediaImportReport = { added: 0, duplicates: 0, unknownWords: [], invalid: [] };
  for (const r of rows) {
    if (r.error || !r.input) {
      report.invalid.push({ rowNumber: r.rowNumber, word: r.word, error: r.error ?? "صف غير صالح" });
      continue;
    }
    const entryId = idx.get(lexKey(r.word));
    if (!entryId) {
      report.unknownWords.push(r.word);
      continue;
    }
    const v = validateMedia(r.input);
    if (!v.ok) {
      report.invalid.push({ rowNumber: r.rowNumber, word: r.word, error: v.error });
      continue;
    }
    const res = await addMedia(db, { entryId, input: r.input, addedBy });
    if (res.duplicate) report.duplicates++;
    else report.added++;
  }
  return report;
}

export async function decideMedia(db: DbOrTx, id: string, status: "approved" | "rejected", reviewerId: string | null) {
  await db.update(entryMedia).set({ status, reviewedBy: reviewerId, reviewedAt: new Date() }).where(eq(entryMedia.id, id));
}

export async function approvedMediaFor(db: DbOrTx, entryIds: string[]): Promise<Map<string, ApprovedMedia[]>> {
  const out = new Map<string, ApprovedMedia[]>();
  if (!entryIds.length) return out;
  const rows = await db
    .select()
    .from(entryMedia)
    .where(and(inArray(entryMedia.entryId, entryIds), eq(entryMedia.status, "approved")))
    .orderBy(entryMedia.createdAt);
  for (const r of rows) {
    const list = out.get(r.entryId) ?? [];
    list.push({ id: r.id, kind: r.kind, url: r.url, youtubeId: r.youtubeId, startSec: r.startSec, endSec: r.endSec, credit: r.credit });
    out.set(r.entryId, list);
  }
  return out;
}

export async function mediaStats(db: DbOrTx) {
  const rows = await db.select({ status: entryMedia.status, n: sql<number>`count(*)::int` }).from(entryMedia).groupBy(entryMedia.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
}

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/**
 * A starter sheet for the team: animal words first (sounds → audio/YouTube, animals, young and homes →
 * pictures), skipping words that already have approved media. Links are left empty for people to fill.
 */
export async function mediaTemplateCsv(db: DbOrTx) {
  const rels = await db
    .select({ type: vocabularyRelationships.type, from: vocabularyRelationships.fromEntryId, to: vocabularyRelationships.toEntryId })
    .from(vocabularyRelationships)
    .where(and(eq(vocabularyRelationships.status, "approved"), inArray(vocabularyRelationships.type, ["sound", "animal_young", "animal_home", "animal_female"])));
  const ids = [...new Set(rels.flatMap((r) => [r.from, r.to]))];
  const ents = ids.length ? await db.select({ id: vocabularyEntries.id, lemma: vocabularyEntries.lemma }).from(vocabularyEntries).where(and(inArray(vocabularyEntries.id, ids), eq(vocabularyEntries.status, "approved"))) : [];
  const lemma = new Map(ents.map((e) => [e.id, e.lemma]));
  const has = new Set((await db.select({ id: entryMedia.entryId }).from(entryMedia).where(eq(entryMedia.status, "approved"))).map((r) => r.id));
  const lines = new Map<string, string[]>();
  const add = (entryId: string, kind: string, hint: string) => {
    const w = lemma.get(entryId);
    if (!w || has.has(entryId) || lines.has(`${entryId}:${kind}`)) return;
    lines.set(`${entryId}:${kind}`, [w, kind, "", "", "", "", hint]);
  };
  for (const r of rels) {
    const a = lemma.get(r.from) ?? "";
    if (r.type === "sound") {
      add(r.to, "يوتيوب", `صوت ${a} (${lemma.get(r.to) ?? ""}) — مقطع قصير، حدّد من وإلى`);
      add(r.from, "صورة", `صورة ${a}`);
    } else add(r.to, "صورة", `صورة ${lemma.get(r.to) ?? ""} (${a})`);
  }
  const head = ["الكلمة", "النوع", "الرابط", "من", "إلى", "المصدر", "ملاحظة للبحث"];
  return "﻿" + [head, ...lines.values()].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
