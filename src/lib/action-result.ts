import "server-only";
import { UnauthorizedError } from "@/features/auth/dal";
import { RateLimitError } from "./rate-limit";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Uniform, safe error handling for Server Actions: never leaks internals to the browser. */
export async function runAction<T>(
  fn: () => Promise<T>,
  known: Record<string, string> = {},
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof UnauthorizedError)
      return { ok: false, error: "انتهت جلستك. سجّل الدخول من جديد." };
    if (err instanceof RateLimitError)
      return { ok: false, error: "طلبات كثيرة خلال وقت قصير. انتظر قليلًا." };
    const code = (err as { code?: string })?.code;
    if (code && known[code]) return { ok: false, error: known[code] };
    console.error("[action] failed", err);
    return { ok: false, error: "حدث خطأ غير متوقع. حاول مرة أخرى." };
  }
}
