"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { badges, levels, xpRules } from "@/db/schema";
import { assertAdmin } from "@/features/auth/dal";
import { isXpAction } from "@/features/gamification/xp-rules";
import { sanitizeText } from "@/lib/utils";
import { audit } from "./audit";

const badgeSchema = z.object({
  id: z.uuid(),
  name: z
    .string()
    .transform((s) => sanitizeText(s, 40))
    .pipe(z.string().min(2)),
  description: z
    .string()
    .transform((s) => sanitizeText(s, 140))
    .pipe(z.string().min(2)),
  icon: z.string().max(20),
  threshold: z.coerce.number().int().min(1).max(100000),
  enabled: z.boolean(),
});

export async function saveBadgeAction(form: FormData) {
  const admin = await assertAdmin();
  const data = badgeSchema.parse({
    id: form.get("id"),
    name: form.get("name"),
    description: form.get("description"),
    icon: form.get("icon"),
    threshold: form.get("threshold"),
    enabled: form.get("enabled") === "on",
  });
  await getDb().transaction(async (tx) => {
    const { id, ...rest } = data;
    await tx.update(badges).set(rest).where(eq(badges.id, id));
    await audit(
      {
        actorUserId: admin.id,
        action: "badge.update",
        entityType: "badge",
        entityId: id,
        metadata: rest,
      },
      tx,
    );
  });
  revalidatePath("/admin/badges");
}

export async function saveXpRuleAction(form: FormData) {
  const admin = await assertAdmin();
  const action = String(form.get("action"));
  if (!isXpAction(action)) throw new Error("invalid action");
  const xp = z.coerce.number().int().min(0).max(500).parse(form.get("xp"));
  const capRaw = String(form.get("dailyCap") ?? "").trim();
  const dailyCap = capRaw === "" ? null : z.coerce.number().int().min(0).max(5000).parse(capRaw);
  const enabled = form.get("enabled") === "on";
  await getDb().transaction(async (tx) => {
    await tx.update(xpRules).set({ xp, dailyCap, enabled }).where(eq(xpRules.action, action));
    await audit(
      {
        actorUserId: admin.id,
        action: "xp_rule.update",
        entityType: "xp_rule",
        entityId: action,
        metadata: { xp, dailyCap, enabled },
      },
      tx,
    );
  });
  revalidatePath("/admin/xp-rules");
}

export async function saveLevelAction(form: FormData) {
  const admin = await assertAdmin();
  const level = z.coerce.number().int().min(1).parse(form.get("level"));
  const name = sanitizeText(String(form.get("name") ?? ""), 40);
  const minXp = z.coerce.number().int().min(0).max(1_000_000).parse(form.get("minXp"));
  if (level === 1 && minXp !== 0) throw new Error("Level 1 must start at 0 XP");
  await getDb().transaction(async (tx) => {
    await tx.update(levels).set({ name, minXp }).where(eq(levels.level, level));
    await audit(
      {
        actorUserId: admin.id,
        action: "level.update",
        entityType: "level",
        entityId: String(level),
        metadata: { name, minXp },
      },
      tx,
    );
  });
  revalidatePath("/admin/xp-rules");
}
