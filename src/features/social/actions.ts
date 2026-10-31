"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertUser } from "@/features/auth/dal";
import { runAction } from "@/lib/action-result";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sanitizeText } from "@/lib/utils";
import { acceptInvite, blockUser, createChallenge, createInvite, joinChallenge, removeFriend, reportUser, SocialError } from "./service";

const ERRORS = {
  invalid_link: "الرابط غير صحيح.",
  expired: "انتهت صلاحية الرابط.",
  self: "لا يمكنك تحدي نفسك.",
  blocked: "لا يمكن إتمام ذلك.",
  not_friends: "ليس ضمن أصدقائك.",
  unknown_game: "لعبة غير متاحة للتحدي.",
  content_unavailable: "لا توجد كلمات كافية لإنشاء تحدٍّ الآن.",
  not_found: "غير موجود.",
};

export async function createInviteAction() {
  return runAction(async () => {
    const user = await assertUser();
    await enforceRateLimit(`invite:${user.id}`, 10, 3600);
    return createInvite(user.id);
  }, ERRORS);
}

export async function acceptInviteAction(form: FormData) {
  const user = await assertUser();
  const code = z.string().min(8).max(40).parse(form.get("code"));
  try {
    await acceptInvite(user.id, code);
  } catch (e) {
    if (e instanceof SocialError) redirect(`/f/${code}?error=${e.code}`);
    throw e;
  }
  revalidatePath("/friends");
  redirect("/friends?added=1");
}

export async function createChallengeAction(gameId: string) {
  return runAction(async () => {
    const user = await assertUser();
    await enforceRateLimit(`challenge:${user.id}`, 10, 3600);
    return createChallenge(user.id, z.string().max(40).parse(gameId));
  }, ERRORS);
}

export async function joinChallengeAction(form: FormData) {
  const user = await assertUser();
  const code = z.string().min(8).max(40).parse(form.get("code"));
  let sessionId: string;
  try {
    ({ sessionId } = await joinChallenge(user.id, code));
  } catch (e) {
    if (e instanceof SocialError) redirect(`/c/${code}?error=${e.code}`);
    throw e;
  }
  redirect(`/play/session/${sessionId}`);
}

export async function removeFriendAction(form: FormData) {
  const user = await assertUser();
  await removeFriend(user.id, z.uuid().parse(form.get("userId")));
  revalidatePath("/friends");
}

export async function blockUserAction(form: FormData) {
  const user = await assertUser();
  await blockUser(user.id, z.uuid().parse(form.get("userId")));
  revalidatePath("/friends");
}

export async function reportUserAction(form: FormData) {
  const user = await assertUser();
  await enforceRateLimit(`report:${user.id}`, 10, 3600);
  const reason = z.enum(["inappropriate", "cheating", "bullying", "other"]).parse(form.get("reason"));
  await reportUser(user.id, z.uuid().parse(form.get("userId")), reason, sanitizeText(String(form.get("context") ?? ""), 300) || undefined);
  revalidatePath("/friends");
  redirect("/friends?reported=1");
}
