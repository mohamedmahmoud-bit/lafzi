"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { assertUser } from "@/features/auth/dal";
import { runAction } from "@/lib/action-result";
import { enforceRateLimit } from "@/lib/rate-limit";
import { answerRound, completeGame, GameError, memoryAttempt, startGame, useHint } from "./session.service";

const ERRORS = {
  unknown_game: "لعبة غير معروفة.",
  not_live: "هذه اللعبة غير متاحة بعد.",
  content_unavailable: "لا توجد كلمات معتمدة كافية لهذه اللعبة الآن.",
  not_found: "لم نجد هذه الجولة.",
  not_in_progress: "انتهت هذه الجولة بالفعل.",
  bad_round: "اختيار غير صالح.",
  incomplete: "أكمل كل الأسئلة أولًا.",
  answered: "أجبت عن هذا بالفعل.",
  time_up: "انتهى الوقت!",
};

const REL = z.enum(["synonym", "antonym", "sound", "animal_young", "animal_home", "plural", "verb_present", "animal_female"]);

export async function startGameAction(form: FormData) {
  const user = await assertUser();
  await enforceRateLimit(`game_start:${user.id}`, 30, 60);
  const gameId = z.string().max(40).parse(form.get("gameId"));
  const category = z.string().max(40).regex(/^vo_[a-z_]+$/).optional().safeParse(form.get("category") || undefined);
  const relationType = REL.optional().safeParse(form.get("relationType") || undefined);
  let id: string;
  try {
    ({ id } = await startGame(user.id, gameId, {
      timed: form.get("timed") === "1",
      category: category.success ? category.data : undefined,
      relationType: relationType.success ? relationType.data : undefined,
    }));
  } catch (e) {
    if (e instanceof GameError) redirect(`/play/${gameId}?error=${e.code}`);
    throw e;
  }
  redirect(`/play/session/${id}`);
}

const roundSchema = z.object({ sessionId: z.uuid(), round: z.number().int().min(0).max(60) });

export async function answerRoundAction(input: { sessionId: string; round: number; choiceId: string }) {
  return runAction(async () => {
    const user = await assertUser();
    await enforceRateLimit(`game_answer:${user.id}`, 120, 60);
    const p = roundSchema.extend({ choiceId: z.string().min(1).max(64) }).parse(input);
    return answerRound(user.id, p.sessionId, p.round, p.choiceId);
  }, ERRORS);
}

export async function memoryAttemptAction(input: { sessionId: string; round: number; choiceId: string }) {
  return runAction(async () => {
    const user = await assertUser();
    await enforceRateLimit(`game_answer:${user.id}`, 120, 60);
    const p = roundSchema.extend({ choiceId: z.string().min(1).max(64) }).parse(input);
    return memoryAttempt(user.id, p.sessionId, p.round, p.choiceId);
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
    await enforceRateLimit(`game_complete:${user.id}`, 30, 60);
    return completeGame(user.id, z.uuid().parse(sessionId));
  }, ERRORS);
}
