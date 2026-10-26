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
  NOON_AUTH_CLIENT_ID: z.string().optional(),
  NOON_AUTH_CLIENT_SECRET: z.string().optional(),
  NOON_AUTH_ISSUER: z.string().optional(),
  NOON_AUTH_REDIRECT_URI: z.string().optional(),
  NOON_AUTH_SCOPES: z.string().default("openid profile"),
  NOON_AUTH_STUDENT_ID_CLAIM: z.string().default("sub"),
  NOON_AUTH_NAME_CLAIM: z.string().default("name"),
  ADMIN_NOON_STUDENT_IDS: z.string().default(""),
  NOON_LEARNING_PROVIDER: z.enum(["mock", "http", "none"]).default("mock"),
  NOON_API_BASE_URL: z.string().optional(),
  NOON_API_TIMEOUT_MS: z.coerce.number().int().positive().default(2500),
  NOON_PRACTICE_URL_TEMPLATE: z.string().optional(),
  NOON_HEATMAP_URL: z.string().optional(),
  NOON_SKILL_ID_MAP: z.string().optional(),
  STREAK_FREEZE_ENABLED: bool,
  ANALYTICS_SINKS: z.string().default("db"),
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
