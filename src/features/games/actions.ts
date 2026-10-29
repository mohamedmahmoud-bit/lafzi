"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { assertUser } from "@/features/auth/dal";
import { runAction } from "@/lib/action-result";
import { enforceRateLimit } from "@/lib/rate-limit";
import { answerRound, completeGame, GameError, startGame, useHint } from "./session.service";

const ERRORS = {
  unknown_game: "لعبة غير معروفة.",
  not_live: "هذه اللعبة غير متاحة بعد.",
  content_unavailable: "لا توجد أسئلة منشورة كافية من بنك نون لهذه اللعبة الآن.",
  not_found: "لم نجد هذه الجولة.",
  not_in_progress: "انتهت هذه الجولة بالفعل.",
  bad_round: "سؤال أو خيار غير صالح.",
  incomplete: "أجب عن جميع الأسئلة أولًا.",
  answered: "أجبت عن هذا السؤال بالفعل.",
};

export async function startGameAction(form: FormData) {
  const user = await assertUser();
  await enforceRateLimit(`game_start:${user.id}`, 20, 60);
  const gameId = z.string().max(40).parse(form.get("gameId"));
  const timed = form.get("timed") === "1";
  let id: string;
  try {
    ({ id } = await startGame(user.id, gameId, { timed }));
  } catch (e) {
    if (e instanceof GameError) redirect(`/play/${gameId}?error=${e.code}`);
    throw e;
  }
  redirect(`/play/session/${id}`);
}

const roundSchema = z.object({ sessionId: z.uuid(), round: z.number().int().min(0).max(50) });

export async function answerRoundAction(input: { sessionId: string; round: number; choiceId: string }) {
  return runAction(async () => {
    const user = await assertUser();
    await enforceRateLimit(`game_answer:${user.id}`, 90, 60);
    const p = roundSchema.extend({ choiceId: z.string().min(1).max(40) }).parse(input);
    return answerRound(user.id, p.sessionId, p.round, p.choiceId);
  }, ERRORS);
}

export async function hintAction(input: { sessionId: string; round: number }) {
  return runAction(async () => {
    const user = await assertUser();
    await enforceRateLimit(`game_hint:${user.id}`, 60, 60);
    const p = roundSchema.parse(input);
    return useHint(user.id, p.sessionId, p.round);
  }, ERRORS);
}

export async function completeGameAction(sessionId: string) {
  return runAction(async () => {
    const user = await assertUser();
    await enforceRateLimit(`game_complete:${user.id}`, 20, 60);
    return completeGame(user.id, z.uuid().parse(sessionId));
  }, ERRORS);
}
