"use server";

import { z } from "zod";
import { assertUser } from "@/features/auth/dal";
import { runAction } from "@/lib/action-result";
import { enforceRateLimit } from "@/lib/rate-limit";
import { rateVocabWod, revealVocabWod } from "./wod.service";

const ERRORS = { unavailable: "كلمة اليوم غير متاحة الآن." };

export async function revealVocabWodAction() {
  return runAction(async () => {
    const user = await assertUser();
    await enforceRateLimit(`wod:${user.id}`, 30, 60);
    return revealVocabWod(user.id);
  }, ERRORS);
}

export async function rateVocabWodAction(knew: boolean) {
  return runAction(async () => {
    const user = await assertUser();
    await enforceRateLimit(`wod:${user.id}`, 30, 60);
    return rateVocabWod(user.id, z.boolean().parse(knew));
  }, ERRORS);
}
