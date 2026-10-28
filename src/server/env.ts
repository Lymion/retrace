import { z } from "zod";

// A blank line like `ANTHROPIC_API_KEY=` in .env means "not set", not "empty key".
const optionalSecret = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);

const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);

export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  TUTOR_MODEL: z.string().min(1).default("claude-sonnet-5-5"),
  FAST_MODEL: z.string().min(1).default("claude-haiku-5-5"),
  ANTHROPIC_API_KEY: optionalSecret,
  GITHUB_TOKEN: optionalSecret,
  RETRACE_DATA_DIR: z.string().min(1).default("data"),
  MAX_UPLOAD_MB: positiveInt(50),
  MAX_FILES: positiveInt(5000),
  AI_RATE_LIMIT_PER_MIN: positiveInt(20),
  /** Optional JSON file of outside notes for the tutor (see docs/extending.md). */
  RETRACE_CONTEXT_FILE: optionalSecret,
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    // Only print which variables are wrong, never their values (they may be secrets).
    const fields = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid environment variables: ${fields}. Check your .env file.`);
  }
  return result.data;
}

let cached: Env | undefined;

/** Server-side env, parsed once. Next.js loads .env into process.env for us. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Tests change env vars between cases, so they need to drop the cache. */
export function resetEnvCache(): void {
  cached = undefined;
}
