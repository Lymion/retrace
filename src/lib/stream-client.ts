import { ApiError } from "./api-client";

// Reads a streamed text reply from our API. Errors before the stream starts
// arrive as normal JSON errors; errors during the stream arrive as a marker
// line at the end (see src/server/ai/stream.ts).

const STREAM_ERROR_MARK = "\u001eretrace-error:";

export async function streamPost(
  url: string,
  body: unknown,
  onText: (textSoFar: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError("Could not reach the Retrace server. Is it still running?", 0);
  }

  if (!response.ok || !response.body) {
    type ErrorBody = { error?: { message?: string; code?: string; provider?: string } };
    const data = (await response.json().catch(() => null)) as ErrorBody | null;
    throw new ApiError(
      data?.error?.message ?? `Request failed (${response.status}).`,
      response.status,
      data?.error?.code,
      data?.error?.provider,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    const mark = text.indexOf(STREAM_ERROR_MARK);
    if (mark !== -1) {
      const payload = JSON.parse(text.slice(mark + STREAM_ERROR_MARK.length) || "{}") as {
        message?: string;
        code?: string;
        provider?: string;
      };
      onText(text.slice(0, mark).trimEnd());
      throw new ApiError(
        payload.message ?? "The tutor stopped unexpectedly.",
        502,
        payload.code,
        payload.provider,
      );
    }
    onText(text);
  }
  return text;
}
