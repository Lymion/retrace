// Browser-side fetch wrapper. Every API route answers errors as
// { error: { message, code } }, so callers get one Error type to show.

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new ApiError("Could not reach the Retrace server. Is it still running?", 0);
  }
  if (response.status === 204) return undefined as T;

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // fall through: a non-JSON error page
  }
  if (!response.ok) {
    const error = (body as { error?: { message?: string; code?: string } } | null)?.error;
    throw new ApiError(
      error?.message ?? `Request failed (${response.status}).`,
      response.status,
      error?.code,
    );
  }
  return body as T;
}

export function postJson<T>(url: string, data: unknown, init?: RequestInit): Promise<T> {
  return apiFetch<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    ...init,
  });
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
