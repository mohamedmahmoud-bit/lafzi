/** Stand-ins for the Server Actions, same result shapes. */
import * as e from "../engine";
import { navigate } from "../router";

const MESSAGES: Record<string, string> = {
  not_guessed: "خمّن المعنى أولًا.",
  not_found: "لم نجد هذه الجلسة.",
  not_in_progress: "انتهت هذه الجلسة بالفعل.",
  bad_item: "سؤال أو خيار غير صالح.",
  incomplete: "أجب عن جميع الأسئلة أولًا.",
};
async function run<T>(fn: () => T) {
  try {
    return { ok: true as const, data: fn() };
  } catch (err) {
    const code = (err as { code?: string }).code ?? "";
    return { ok: false as const, error: MESSAGES[code] ?? "حدث خطأ غير متوقع. حاول مرة أخرى." };
  }
}
export const guessWodAction = (opt: string) => run(() => e.submitWodGuess(opt));
export const answerWodAction = (opt: string) => run(() => e.answerWod(opt));
export const answerItemAction = (i: { sessionId: string; index: number; optionId: string }) =>
  run(() => e.answerItem(i.sessionId, i.index, i.optionId));
export const completeSessionAction = (id: string) => run(() => e.completeSession(id));
export async function startSessionAction() {
  navigate(`/practice/${e.startSession()}`);
}
