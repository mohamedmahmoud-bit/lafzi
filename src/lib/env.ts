import "server-only";
import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z.enum(["disable", "require"]).default("disable"),
  DATABASE_SSL_CA_PATH: z.string().optional(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(16),
  AUTH_PROVIDER: z.enum(["mock", "oidc", "citadel"]).default("mock"),
  // Noon Citadel (per-app credentials from the Citadel portal)
  SYNAPSE_APP_ID: z.string().optional(),
  SYNAPSE_APP_SECRET: z.string().optional(),
  SYNAPSE_BASE_URL: z.string().url().default("https://citadel.studyatnoon.com"),
  // Login audience for Citadel's authorize URL; must be one of the app's allowed types. Empty = omit.
  CITADEL_USER_TYPE: z.string().default("STUDENT"),
  NOON_AUTH_CLIENT_ID: z.string().optional(),
  NOON_AUTH_CLIENT_SECRET: z.string().optional(),
  NOON_AUTH_ISSUER: z.string().optional(),
  NOON_AUTH_REDIRECT_URI: z.string().optional(),
  NOON_AUTH_SCOPES: z.string().default("openid profile"),
  NOON_AUTH_STUDENT_ID_CLAIM: z.string().default("sub"),
  NOON_AUTH_NAME_CLAIM: z.string().default("name"),
  ADMIN_NOON_STUDENT_IDS: z.string().default(""),
  STREAK_FREEZE_ENABLED: bool,
  // ─── Noon question bank (single source of truth for assessment content) ───
  NOON_QB_PROVIDER: z.enum(["none", "mock", "http", "file"]).default("none"),
  NOON_QB_BASE_URL: z.string().optional(),
  NOON_QB_TOKEN: z.string().optional(),
  NOON_QB_SEARCH_PATH: z.string().optional(),
  NOON_QB_DETAIL_PATH: z.string().default("/questions/{id}"),
  NOON_QB_IMPORT_FILE: z.string().optional(),
  /** Comma list of Noon chapter ids to reconcile; default = every verbal chapter. */
  NOON_QB_CHAPTERS: z.string().default("2854,2855,2856,2857,2858,2859,5505"),
  CRON_SECRET: z.string().optional(),
  // ─── Noon practice deep links ───
  NOON_PRACTICE_ALLOWED_HOSTS: z.string().default("student.noonacademy.com,student.noon.edu.sa,student.school.studyatnoon.com"),
  ANALYTICS_SINKS: z.string().default("db"),
  /**
   * Students may be minors: full names are shown to classmates beyond friends only when the school /
   * Noon has authorised it. Otherwise cohort boards show friends only (+ your own rank).
   */
  COHORT_LEADERBOARD_NAMES: bool,
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated server environment. Throws a readable error on misconfiguration. */
export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      throw new Error(`Invalid environment configuration:\n${issues.join("\n")}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export const isProduction = () => env().NODE_ENV === "production";
