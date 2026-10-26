import { z } from "zod";
import { sanitizeText } from "@/lib/utils";

const text = (max: number) => z.string().transform((s) => sanitizeText(s, max));
const list = z
  .array(text(60))
  .max(12)
  .transform((a) => [...new Set(a.filter(Boolean))]);

export const wordInputSchema = z.object({
  word: text(40).pipe(z.string().min(1, "الكلمة مطلوبة")),
  meaning: text(200).pipe(z.string().min(2, "المعنى مطلوب")),
  synonyms: list.pipe(z.array(z.string()).min(1, "أضف مرادفًا واحدًا على الأقل")),
  antonyms: list,
  example: text(300).pipe(z.string().min(4, "المثال مطلوب")),
  relationNote: text(300)
    .optional()
    .transform((s) => s || null),
  difficulty: z.coerce.number().int().min(1).max(3),
  category: text(40).transform((s) => s || "عام"),
  active: z.boolean().default(true),
});

export type WordInput = z.output<typeof wordInputSchema>;

export const CSV_COLUMNS = [
  "word",
  "meaning",
  "synonyms",
  "antonyms",
  "example",
  "difficulty",
  "category",
] as const;
