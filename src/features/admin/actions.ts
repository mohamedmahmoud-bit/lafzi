"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { badges, levels, xpRules } from "@/db/schema";
import { assertAdmin } from "@/features/auth/dal";
import { isXpAction } from "@/features/gamification/xp-rules";
import { splitList } from "@/lib/csv";
import { enforceRateLimit } from "@/lib/rate-limit";
import { learningDay } from "@/lib/time";
import { sanitizeText } from "@/lib/utils";
import { audit } from "./audit";
import { parseVocabularyCsv } from "./csv-import";
import { clearWod, scheduleWod, setWordActive, upsertWord, WodScheduleError } from "./service";
import { wordInputSchema } from "./word-input";

export type FormState = { ok?: boolean; message?: string; errors?: string[] } | null;

export async function saveWordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await assertAdmin();
  const parsed = wordInputSchema.safeParse({
    word: form.get("word") ?? "",
    meaning: form.get("meaning") ?? "",
    synonyms: splitList(String(form.get("synonyms") ?? "")),
    antonyms: splitList(String(form.get("antonyms") ?? "")),
    example: form.get("example") ?? "",
    relationNote: form.get("relationNote") ?? "",
    difficulty: form.get("difficulty") ?? 2,
    category: form.get("category") ?? "",
    active: form.get("active") === "on",
  });
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  if (!parsed.data.example.includes(parsed.data.word)) {
    return {
      ok: false,
      errors: ["يجب أن يحتوي المثال على الكلمة كما كُتبت (لأسئلة إكمال الجملة)."],
    };
  }
  const id = z
    .uuid()
    .optional()
    .safeParse(form.get("id") || undefined);
  await upsertWord(admin.id, parsed.data, id.success ? id.data : undefined);
  revalidatePath("/admin/words");
  redirect("/admin/words?saved=1");
}

export async function toggleWordAction(form: FormData) {
  const admin = await assertAdmin();
  const id = z.uuid().parse(form.get("id"));
  await setWordActive(admin.id, id, form.get("active") === "true");
  revalidatePath("/admin/words");
}

export async function importCsvAction(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await assertAdmin();
  await enforceRateLimit(`csv:${admin.id}`, 10, 300);
  const file = form.get("file");
  let text = String(form.get("csv") ?? "");
  if (file instanceof File && file.size > 0) {
    if (file.size > 2_000_000) return { ok: false, message: "الملف أكبر من 2MB." };
    text = new TextDecoder("utf-8").decode(await file.arrayBuffer());
  }
  const { rows, headerError } = parseVocabularyCsv(text);
  if (headerError) return { ok: false, message: headerError };
  const valid = rows.filter((r) => r.ok);
  const invalid = rows.filter((r) => !r.ok);
  let created = 0;
  let updated = 0;
  await getDb().transaction(async (tx) => {
    for (const r of valid) {
      if (!r.ok) continue;
      const res = await upsertWord(admin.id, r.value, undefined, tx);
      if (res.created) created++;
      else updated++;
    }
    await audit(
      {
        actorUserId: admin.id,
        action: "word.csv_import",
        metadata: { created, updated, rejected: invalid.length },
      },
      tx,
    );
  });
  revalidatePath("/admin/words");
  return {
    ok: true,
    message: `تمت إضافة ${created} وتحديث ${updated} كلمة. رُفض ${invalid.length} سطر.`,
    errors: invalid.map((r) => (r.ok ? "" : `سطر ${r.line}: ${r.error}`)),
  };
}

const WOD_ERRORS: Record<string, string> = {
  word_not_found: "الكلمة غير موجودة أو غير مفعّلة في بنك الكلمات.",
  recent_repeat: "هذه الكلمة استُخدمت كلمةً لليوم مؤخرًا",
  past_day: "لا يمكن تعديل يوم مضى أو اليوم الحالي.",
};

export async function scheduleWodAction(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await assertAdmin();
  const day = z.iso.date().safeParse(form.get("day"));
  if (!day.success) return { ok: false, message: "تاريخ غير صالح." };
  try {
    await scheduleWod(
      admin.id,
      day.data,
      sanitizeText(String(form.get("word") ?? ""), 40),
      learningDay(),
      form.get("force") === "on",
    );
  } catch (err) {
    if (err instanceof WodScheduleError) {
      return {
        ok: false,
        message:
          WOD_ERRORS[err.code] +
          (err.detail ? ` (${err.detail}). فعّل «تجاوز» إن كان ذلك مقصودًا.` : ""),
      };
    }
    throw err;
  }
  revalidatePath("/admin/word-of-day");
  return { ok: true, message: "تمت الجدولة." };
}

export async function clearWodAction(form: FormData) {
  const admin = await assertAdmin();
  await clearWod(admin.id, z.iso.date().parse(form.get("day")), learningDay());
  revalidatePath("/admin/word-of-day");
}

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
