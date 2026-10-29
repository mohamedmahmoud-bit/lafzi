import "server-only";
import { and, asc, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import { getDb } from "@/db/client";
import { skillProgress, studentResourceProgress, studyResources, studyResourceSubskills, studyResourceTopics } from "@/db/schema";
import { isProduction } from "@/lib/env";
import { resolveResource } from "./providers";

export type ResourceCard = {
  id: string;
  title: string;
  description: string;
  resourceType: string;
  isDevExample: boolean;
  topicIds: string[];
  subskillIds: string[];
};

function visible(): SQL {
  // Production: published only. Development: published + clearly-labelled dev examples.
  return isProduction()
    ? and(eq(studyResources.status, "published"), eq(studyResources.isDevExample, false))!
    : or(eq(studyResources.status, "published"), eq(studyResources.isDevExample, true))!;
}

async function withLinks(rows: (typeof studyResources.$inferSelect)[]): Promise<ResourceCard[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const db = getDb();
  const topics = await db.select().from(studyResourceTopics).where(inArray(studyResourceTopics.resourceId, ids));
  const skills = await db.select().from(studyResourceSubskills).where(inArray(studyResourceSubskills.resourceId, ids));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    resourceType: r.resourceType,
    isDevExample: r.isDevExample,
    topicIds: topics.filter((t) => t.resourceId === r.id).map((t) => t.topicId),
    subskillIds: skills.filter((s) => s.resourceId === r.id).map((s) => s.subskillId),
  }));
}

export async function listResources(f: { topicId?: string; subskillId?: string; type?: string; q?: string }) {
  const db = getDb();
  const conds: SQL[] = [visible()];
  if (f.type) conds.push(eq(studyResources.resourceType, f.type));
  if (f.q) conds.push(or(ilike(studyResources.title, `%${f.q}%`), ilike(studyResources.description, `%${f.q}%`))!);
  if (f.topicId) {
    conds.push(inArray(studyResources.id, db.select({ id: studyResourceTopics.resourceId }).from(studyResourceTopics).where(eq(studyResourceTopics.topicId, f.topicId))));
  }
  if (f.subskillId) {
    conds.push(inArray(studyResources.id, db.select({ id: studyResourceSubskills.resourceId }).from(studyResourceSubskills).where(eq(studyResourceSubskills.subskillId, f.subskillId))));
  }
  const rows = await db.select().from(studyResources).where(and(...conds)).orderBy(asc(studyResources.isDevExample), desc(studyResources.updatedAt)).limit(60);
  return withLinks(rows);
}

export async function getResource(id: string) {
  const [r] = await getDb().select().from(studyResources).where(and(eq(studyResources.id, id), visible())).limit(1);
  if (!r) return null;
  const [card] = await withLinks([r]);
  return { ...card, ...resolveResource(r.isDevExample ? "dev_example" : r.storageProvider, r.locator) };
}

/** Same canonical taxonomy as games: subskill match first, then topic. */
export async function resourcesForSkill(p: { topicId?: string | null; subskillId?: string | null }, limit = 3) {
  if (p.subskillId) {
    const exact = await listResources({ subskillId: p.subskillId });
    if (exact.length) return exact.slice(0, limit);
  }
  return p.topicId ? (await listResources({ topicId: p.topicId })).slice(0, limit) : [];
}

/** Recommended for this student: resources for their weakest local subskills. */
export async function recommendedForStudent(userId: string, limit = 3) {
  const weak = await getDb()
    .select({ subskillId: skillProgress.subskillId })
    .from(skillProgress)
    .where(eq(skillProgress.userId, userId))
    .orderBy(asc(skillProgress.mastery))
    .limit(3);
  const out: ResourceCard[] = [];
  for (const w of weak) {
    for (const r of await listResources({ subskillId: w.subskillId })) {
      if (!out.some((o) => o.id === r.id)) out.push(r);
    }
  }
  return out.slice(0, limit);
}

export async function recordResourceOpened(userId: string, resourceId: string) {
  await getDb()
    .insert(studentResourceProgress)
    .values({ userId, resourceId, status: "opened" })
    .onConflictDoUpdate({ target: [studentResourceProgress.userId, studentResourceProgress.resourceId], set: { updatedAt: new Date() } });
}
