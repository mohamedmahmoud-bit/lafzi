import "server-only";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { skillProgress } from "@/db/schema";
import { getTaxonomy } from "@/features/curriculum/service";

/** Minimum answers on a subskill before we call it "weak" (avoid noise). */
const MIN_ATTEMPTS = 3;

/** Local (لفظي) skill picture. Always labelled as local — this is NOT Noon's official heat map. */
export async function getLocalSkills(userId: string) {
  const tax = await getTaxonomy();
  const rows = await getDb().select().from(skillProgress).where(eq(skillProgress.userId, userId)).orderBy(asc(skillProgress.mastery));
  const withNames = rows
    .map((r) => {
      const s = tax.subskill(r.subskillId);
      return s ? { ...r, nameAr: s.nameAr, topicId: s.topicId, topicName: tax.topic(s.topicId)?.nameAr ?? "" } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const weak = withNames.find((r) => r.attempts >= MIN_ATTEMPTS && r.mastery < 0.7) ?? null;
  const byTopic: Record<string, { mastery: number; attempts: number }> = {};
  for (const r of withNames) {
    const t = (byTopic[r.topicId] ??= { mastery: 0, attempts: 0 });
    t.mastery = (t.mastery * t.attempts + r.mastery * r.attempts) / Math.max(1, t.attempts + r.attempts);
    t.attempts += r.attempts;
  }
  return { skills: withNames, weak, byTopic };
}
