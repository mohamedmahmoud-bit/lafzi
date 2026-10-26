"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { assertUser } from "@/features/auth/dal";
import { runAction } from "@/lib/action-result";
import { enforceRateLimit } from "@/lib/rate-limit";
import { answerItem, completeSession, startSession } from "./session.service";

const ERRORS = {
  not_found: "لم نجد هذه الجلسة.",
  not_in_progress: "انتهت هذه الجلسة بالفعل.",
  bad_item: "سؤال أو خيار غير صالح.",
  incomplete: "أجب عن جميع الأسئلة أولًا.",
  no_words: "لا توجد كلمات كافية للتدريب الآن.",
};

export async function startSessionAction() {
  const user = await assertUser();
  await enforceRateLimit(`session_start:${user.id}`, 10, 60);
  const { id } = await startSession(user.id);
  redirect(`/practice/${id}`);
}

const answerSchema = z.object({
  sessionId: z.uuid(),
  index: z.number().int().min(0).max(50),
  optionId: z.enum(["a", "b", "c", "d"]),
});

export async function answerItemAction(input: {
  sessionId: string;
  index: number;
  optionId: string;
}) {
  return runAction(async () => {
    const user = await assertUser();
    await enforceRateLimit(`answer:${user.id}`, 60, 60);
    const { sessionId, index, optionId } = answerSchema.parse(input);
    return answerItem(user.id, sessionId, index, optionId);
  }, ERRORS);
}

export async function completeSessionAction(sessionId: string) {
  return runAction(async () => {
    const user = await assertUser();
    await enforceRateLimit(`complete:${user.id}`, 10, 60);
    return completeSession(user.id, z.uuid().parse(sessionId));
  }, ERRORS);
}
