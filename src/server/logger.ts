// One-line JSON logs. Callers pass event names and small facts (ids, counts,
// durations). Never pass file content, prompts, model output or tokens here:
// logs are the easiest place for a secret to leak.

type Fields = Record<string, string | number | boolean | null | undefined>;

function write(level: "info" | "warn" | "error", event: string, fields: Fields = {}) {
  if (process.env.NODE_ENV === "test") return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (event: string, fields?: Fields) => write("info", event, fields),
  warn: (event: string, fields?: Fields) => write("warn", event, fields),
  error: (event: string, fields?: Fields) => write("error", event, fields),
};

/** Error class name and message only; stack traces can include code excerpts. */
export function errorFields(error: unknown): Fields {
  if (error instanceof Error) return { error: error.name, message: error.message.slice(0, 300) };
  return { error: "unknown" };
}
