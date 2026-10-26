"use server";

import { z } from "zod";
import { getCurrentUser } from "@/features/auth/dal";
import { rateLimit } from "@/lib/rate-limit";
import { analytics } from "./analytics";
import { CLIENT_REPORTABLE_EVENTS } from "./events";

const schema = z.object({
  name: z.enum(CLIENT_REPORTABLE_EVENTS),
  props: z
    .record(z.string().max(40), z.union([z.string().max(80), z.number(), z.boolean()]))
    .optional(),
});

/** Allow-listed client events only (e.g. "CTA viewed"). Everything else is tracked server-side. */
export async function trackClientEvent(input: z.input<typeof schema>) {
  const user = await getCurrentUser();
  if (!user) return;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return;
  if (!(await rateLimit(`track:${user.id}`, 60, 60))) return;
  await analytics.track(parsed.data.name, parsed.data.props ?? {}, { userId: user.id });
}
