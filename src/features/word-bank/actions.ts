"use server";

import { z } from "zod";
import { assertUser } from "@/features/auth/dal";
import { runAction } from "@/lib/action-result";
import { enforceRateLimit } from "@/lib/rate-limit";
import { answerVocabWod } from "./wod.service";

const ERRORS = { unavailable: "كلمة اليوم غير متاحة الآن.", bad_option: "اختيار غير صالح — حدّث الصفحة." };

export async function answerVocabWodAction(choiceId: string) {
  return runAction(async () => {
    const user = await assertUser();
    await enforceRateLimit(`wod:${user.id}`, 30, 60);
    return answerVocabWod(user.id, z.string().min(1).max(64).parse(choiceId));
  }, ERRORS);
}
