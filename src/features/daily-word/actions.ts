"use server";

import { z } from "zod";
import { assertUser } from "@/features/auth/dal";
import { runAction } from "@/lib/action-result";
import { enforceRateLimit } from "@/lib/rate-limit";
import { answerWod, submitWodGuess } from "./service";

const optionId = z.enum(["a", "b", "c", "d"]);
const ERRORS = {
  not_guessed: "خمّن المعنى أولًا.",
  bad_option: "اختيار غير صالح.",
  no_words: "لا توجد كلمات متاحة بعد.",
};

export async function guessWodAction(option: string) {
  return runAction(async () => {
    const user = await assertUser();
    await enforceRateLimit(`wod:${user.id}`, 30, 60);
    return submitWodGuess(user.id, optionId.parse(option));
  }, ERRORS);
}

export async function answerWodAction(option: string) {
  return runAction(async () => {
    const user = await assertUser();
    await enforceRateLimit(`wod:${user.id}`, 30, 60);
    return answerWod(user.id, optionId.parse(option));
  }, ERRORS);
}
