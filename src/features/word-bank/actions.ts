"use server";

import { z } from "zod";
import { assertUser } from "@/features/auth/dal";
import { runAction } from "@/lib/action-result";
import { enforceRateLimit } from "@/lib/rate-limit";
import { answerVocabWod, markVocabWodViewed } from "./wod.service";

const ERRORS = { unavailable: "كلمة اليوم غير متاحة الآن.", bad_option: "اختيار غير صالح." };

export async function viewVocabWodAction() {
  return runAction(async () => {
    const user = await assertUser();
    await enforceRateLimit(`wod:${user.id}`, 30, 60);
    return markVocabWodViewed(user.id);
  }, ERRORS);
}

export async function answerVocabWodAction(choiceId: string) {
  return runAction(async () => {
    const user = await assertUser();
    await enforceRateLimit(`wod:${user.id}`, 30, 60);
    return answerVocabWod(user.id, z.string().min(1).max(40).parse(choiceId));
  }, ERRORS);
}
