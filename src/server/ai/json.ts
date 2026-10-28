import type { z } from "zod";
import { log } from "../logger";
import { AIError, type AIProvider, type AIRequest } from "./provider";

// Every JSON task goes through here: ask, validate with Zod, and on failure
// ask once more with the exact validation error attached. A second failure
// becomes a friendly error for the UI. Same rule for both providers.

type Parsed<T> = { ok: true; data: T } | { ok: false; error: string };

/** Pulls the JSON value out of a reply, tolerating ```json fences or a sentence around it. */
export function extractJson(reply: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(reply)?.[1];
  const candidate = (fenced ?? reply).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.search(/[[{]/);
    const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
    if (start === -1 || end <= start) throw new SyntaxError("No JSON object found in the reply.");
    return JSON.parse(candidate.slice(start, end + 1));
  }
}

export function parseModelJson<T>(
  reply: string,
  schema: z.ZodType<T>,
  check?: (data: T) => string | null,
): Parsed<T> {
  let value: unknown;
  try {
    value = extractJson(reply);
  } catch (error) {
    return { ok: false, error: `The reply was not valid JSON (${(error as Error).message}).` };
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 6)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    return { ok: false, error: `The JSON did not match the required shape: ${issues}.` };
  }
  const problem = check?.(result.data);
  if (problem) return { ok: false, error: problem };
  return { ok: true, data: result.data };
}

export interface JsonTaskOptions<T> {
  provider: AIProvider;
  request: AIRequest;
  schema: z.ZodType<T>;
  /** Extra rules a schema cannot express, e.g. "never quote the original code". */
  check?: (data: T) => string | null;
  signal?: AbortSignal;
}

export async function runJsonTask<T>({
  provider,
  request,
  schema,
  check,
  signal,
}: JsonTaskOptions<T>): Promise<T> {
  const first = await provider.complete(request, signal);
  const parsed = parseModelJson(first, schema, check);
  if (parsed.ok) return parsed.data;

  log.warn("ai.invalid_json", { task: request.task, provider: provider.id, attempt: 1 });
  const retry: AIRequest = {
    ...request,
    messages: [
      ...request.messages,
      { role: "assistant", content: first },
      {
        role: "user",
        content: `${parsed.error}\nReply again with only the corrected JSON object, no other text.`,
      },
    ],
  };
  const second = await provider.complete(retry, signal);
  const reparsed = parseModelJson(second, schema, check);
  if (reparsed.ok) return reparsed.data;

  log.warn("ai.invalid_json", { task: request.task, provider: provider.id, attempt: 2 });
  throw new AIError(
    "invalid_output",
    "The tutor's answer came back in the wrong format twice, so it was not saved. Please try again.",
    provider.id,
  );
}
