import "server-only";
import { getDb } from "@/db/client";
import { analytics } from "@/features/analytics/analytics";
import { runVocabularyExtraction } from "@/features/word-bank/service";
import { env, isProduction } from "@/lib/env";
import { getQuestionBankProvider } from "./providers/factory";
import { syncQuestionBank } from "./sync.service";

export const configuredChapters = () =>
  env()
    .NOON_QB_CHAPTERS.split(",")
    .map((c) => Number(c.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);

/** Sync → validate → (re)assess vocabulary. Used by the cron route and the admin button. */
export async function runQuestionBankSync(mode: "scheduled" | "manual" | "seed", triggeredBy: string | null = null) {
  const db = getDb();
  const run = await syncQuestionBank(db, {
    provider: getQuestionBankProvider(),
    mode,
    chapters: configuredChapters(),
    triggeredBy,
    isProduction: isProduction(),
  });
  // Any question that was suspended/archived invalidates vocabulary built on it.
  const vocab = run.status === "succeeded" || run.status === "partial" ? await runVocabularyExtraction(db) : null;
  await analytics.track("question_bank_synced", { runId: run.id, status: run.status, ...(run.stats ?? {}) }, { userId: triggeredBy ?? undefined });
  return { run, vocab };
}
