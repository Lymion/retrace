import { z } from "zod";
import { AIError } from "./ai/provider";
import { ExtractError } from "./ingest/safe-extract";
import { GithubError, SizeLimitError } from "./ingest/github";
import { errorFields, log } from "./logger";

// Small helpers shared by every API route, so errors look the same everywhere:
// { error: { message, code? } } with a fitting HTTP status.

export function errorResponse(
  status: number,
  message: string,
  code?: string,
  extra?: Record<string, string>,
): Response {
  return Response.json({ error: { message, code, ...extra } }, { status });
}

const AI_STATUS: Record<AIError["code"], number> = {
  not_ready: 503,
  rate_limited: 429,
  invalid_output: 502,
  provider_failed: 502,
};

type ParseResult<T> = { ok: true; data: T } | { ok: false; response: Response };

export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<ParseResult<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, response: errorResponse(400, "The request body must be JSON.") };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid request.";
    return { ok: false, response: errorResponse(400, message, "invalid_body") };
  }
  return { ok: true, data: parsed.data };
}

const IdSchema = z.coerce.number().int().positive();

/** Route params are strings; ids must be positive integers or the route 404s. */
export function parseId(value: string | undefined): number | null {
  const parsed = IdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Turns known errors into friendly responses; anything else is logged and hidden. */
export function handleRouteError(error: unknown, event: string): Response {
  if (error instanceof ExtractError) return errorResponse(400, error.message, error.code);
  if (error instanceof SizeLimitError) return errorResponse(413, error.message, "too_large");
  if (error instanceof GithubError) return errorResponse(error.status, error.message, "github");
  if (error instanceof z.ZodError) {
    return errorResponse(400, error.issues[0]?.message ?? "Invalid input.", "invalid_body");
  }
  if (error instanceof HttpError) return errorResponse(error.status, error.message, error.code);
  if (error instanceof AIError) {
    // The provider id lets the UI offer a one-click switch to the other provider.
    log.warn(event, { code: error.code, provider: error.provider });
    return errorResponse(AI_STATUS[error.code], error.message, `ai_${error.code}`, {
      ...(error.provider ? { provider: error.provider } : {}),
    });
  }
  log.error(event, errorFields(error));
  return errorResponse(500, "Something went wrong on the server. Check the terminal for details.");
}

/** Throw from deep inside a handler to return a specific status. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const notFound = (what = "That item") =>
  new HttpError(404, `${what} was not found.`, "not_found");
