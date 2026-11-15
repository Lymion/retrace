import { z } from "zod";
import { type Db, getDb } from "@/db/client";
import { settings as settingsTable } from "@/db/schema";
import { DEPTHS, PROVIDER_IDS } from "@/shared/enums";
import { getEnv } from "./env";

// Settings live in the database so they change without a restart. Env vars
// only provide the starting values. Every read goes to the database, which
// is what makes a provider switch apply to the very next request.

export const REPLY_LANGUAGES = ["auto", "en", "ms"] as const;

export const SettingsSchema = z.object({
  learnerName: z.string().trim().min(1).max(60),
  depth: z.enum(DEPTHS),
  /** "auto" mirrors whatever mix of English and Malay the learner writes in. */
  replyLanguage: z.enum(REPLY_LANGUAGES),
  tutorModel: z.string().trim().min(1).max(100),
  fastModel: z.string().trim().min(1).max(100),
  maxUploadMb: z.number().int().min(1).max(500),
  maxFiles: z.number().int().min(1).max(50_000),
  activeProvider: z.enum(PROVIDER_IDS),
  /** When on, every task runs on the fast model. Cheaper, a little less thorough. */
  economyMode: z.boolean(),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const SettingsPatchSchema = SettingsSchema.partial().strict();

export function defaultSettings(): Settings {
  const env = getEnv();
  return {
    learnerName: "Haykal",
    depth: "beginner",
    replyLanguage: "auto",
    tutorModel: env.TUTOR_MODEL,
    fastModel: env.FAST_MODEL,
    maxUploadMb: env.MAX_UPLOAD_MB,
    maxFiles: env.MAX_FILES,
    // With a key in .env the API is the obvious choice; otherwise use the login.
    activeProvider: env.ANTHROPIC_API_KEY ? "api-key" : "claude-login",
    economyMode: false,
  };
}

export function getSettings(db: Db = getDb()): Settings {
  const merged: Record<string, unknown> = { ...defaultSettings() };
  for (const row of db.select().from(settingsTable).all()) {
    if (row.key in merged) merged[row.key] = row.value;
  }
  const parsed = SettingsSchema.safeParse(merged);
  // A bad stored value (say, from an older version) falls back to defaults
  // instead of breaking every page.
  return parsed.success ? parsed.data : defaultSettings();
}

export function updateSettings(
  patch: z.infer<typeof SettingsPatchSchema>,
  db: Db = getDb(),
): Settings {
  const valid = SettingsPatchSchema.parse(patch);
  db.transaction((tx) => {
    for (const [key, value] of Object.entries(valid)) {
      if (value === undefined) continue;
      tx.insert(settingsTable)
        .values({ key, value })
        .onConflictDoUpdate({ target: settingsTable.key, set: { value } })
        .run();
    }
  });
  return getSettings(db);
}

export const MB = 1024 * 1024;
