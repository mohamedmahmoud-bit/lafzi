import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { studentVocabularyProgress } from "@/db/schema";
import { loadLexicon } from "@/features/lexicon/content";
import { RELATION_TEXT } from "@/features/lexicon/mapping";
import { lexKey } from "@/features/lexicon/normalize";
import type { MasteryState } from "@/features/vocabulary/srs";
import { isProduction } from "@/lib/env";

/** «تعرفها» = the spaced-repetition state reached familiar or mastered (answered right over time). */
const KNOWN: MasteryState[] = ["familiar", "mastered"];
export const STUDY_FILTERS = ["all", "mine", "known", "review", "new"] as const;
export type StudyFilter = (typeof STUDY_FILTERS)[number];
const PAGE = 40;

export type StudyWord = {
  id: string;
  lemma: string;
  categories: string[];
  meanings: { text: string; example: string | null }[];
  relations: { label: string; other: string; direction: "to" | "from" }[];
  state: MasteryState;
  due: boolean;
};

/** The whole approved dictionary as a study resource, with the student's own progress on each word. */
export async function studyWords(userId: string, p: { q?: string; cat?: string; filter?: StudyFilter; page?: number }) {
  const db = getDb();
  const lx = await loadLexicon(db, { isProduction: isProduction() });
  const prog = await db.select().from(studentVocabularyProgress).where(eq(studentVocabularyProgress.userId, userId));
  const byEntry = new Map(prog.map((x) => [x.entryId, x]));
  const now = new Date();
  const q = p.q?.trim() ? lexKey(p.q) : null;
  const filter = p.filter ?? "all";

  const all = [...lx.entries.values()]
    .filter((e) => !p.cat || e.categories.includes(p.cat))
    .filter((e) => !q || lexKey(e.lemma).includes(q))
    .map((e) => {
      const pr = byEntry.get(e.id);
      return { e, state: ((pr?.state as MasteryState) ?? "new") as MasteryState, due: !!pr?.nextReviewAt && pr.nextReviewAt <= now };
    })
    .filter(({ state, due }) =>
      filter === "all" ? true : filter === "mine" ? state !== "new" : filter === "known" ? KNOWN.includes(state) : filter === "review" ? due : state === "new",
    )
    .sort((a, b) => Number(b.due) - Number(a.due) || a.e.lemma.localeCompare(b.e.lemma, "ar"));

  const page = Math.max(1, p.page ?? 1);
  const words: StudyWord[] = all.slice((page - 1) * PAGE, page * PAGE).map(({ e, state, due }) => ({
    id: e.id,
    lemma: e.lemma,
    categories: e.categories,
    meanings: lx.senses.filter((s) => s.entryId === e.id).map((s) => ({ text: s.meaning, example: s.example })),
    relations: lx.relations
      .filter((r) => r.fromId === e.id || r.toId === e.id)
      .map((r) => ({ label: RELATION_TEXT[r.type].label, other: lx.entries.get(r.fromId === e.id ? r.toId : r.fromId)?.lemma ?? "", direction: (r.fromId === e.id ? "to" : "from") as "to" | "from" })),
    state,
    due,
  }));
  return { words, total: all.length, page, pages: Math.max(1, Math.ceil(all.length / PAGE)) };
}

/** How many dictionary words the student knows — overall and per category. */
export async function knowledgeSummary(userId: string) {
  const db = getDb();
  const lx = await loadLexicon(db, { isProduction: isProduction() });
  const prog = await db.select({ entryId: studentVocabularyProgress.entryId, state: studentVocabularyProgress.state }).from(studentVocabularyProgress).where(eq(studentVocabularyProgress.userId, userId));
  const state = new Map(prog.map((x) => [x.entryId, x.state as MasteryState]));
  const cats = new Map<string, { total: number; known: number }>();
  let known = 0;
  let mastered = 0;
  let learning = 0;
  for (const e of lx.entries.values()) {
    const s = state.get(e.id) ?? "new";
    const isKnown = KNOWN.includes(s);
    if (isKnown) known++;
    if (s === "mastered") mastered++;
    if (s === "learning") learning++;
    for (const c of e.categories) {
      const x = cats.get(c) ?? { total: 0, known: 0 };
      x.total++;
      if (isKnown) x.known++;
      cats.set(c, x);
    }
  }
  return { total: lx.entries.size, known, mastered, learning, categories: [...cats.entries()].map(([id, v]) => ({ id, ...v })) };
}
