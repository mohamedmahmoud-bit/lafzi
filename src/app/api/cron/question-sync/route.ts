import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runQuestionBankSync } from "@/features/question-bank/run-sync";
import { env } from "@/lib/env";

export const maxDuration = 300;

/**
 * Scheduled reconciliation (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`).
 * Refuses to run without a configured secret. This is periodic, not real-time.
 */
export async function GET(req: NextRequest) {
  const secret = env().CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  if (!secret || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const { run, vocab } = await runQuestionBankSync("scheduled");
    return NextResponse.json({ runId: run.id, status: run.status, stats: run.stats, vocab });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}
