import { log } from "../logger";
import { AIError } from "./provider";

// Turns a provider's text stream into an HTTP response. We wait for the
// first chunk before answering, so the common failures (provider not ready,
// login expired, rate limited) still come back as a normal JSON error with
// the right status. A failure after that point is sent as a marker line the
// client recognises, because the status code has already gone out.

/** Record separator + tag: cannot appear in normal markdown. */
export const STREAM_ERROR_MARK = "\u001eretrace-error:";

export interface StreamHooks {
  /** Called once with the whole reply when the stream finishes normally. */
  onComplete?: (text: string) => void;
}

export async function streamText(
  source: AsyncIterable<string>,
  hooks: StreamHooks = {},
): Promise<Response> {
  const iterator = source[Symbol.asyncIterator]();
  const first = await iterator.next(); // early errors throw here, before any bytes are sent
  const encoder = new TextEncoder();
  let full = first.done ? "" : first.value;

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      if (!first.done) controller.enqueue(encoder.encode(first.value));
      else {
        hooks.onComplete?.(full);
        controller.close();
      }
    },
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) {
          hooks.onComplete?.(full);
          controller.close();
          return;
        }
        full += next.value;
        controller.enqueue(encoder.encode(next.value));
      } catch (error) {
        const payload =
          error instanceof AIError
            ? { message: error.message, code: `ai_${error.code}`, provider: error.provider }
            : { message: "The tutor stopped unexpectedly. Try again." };
        log.warn("stream.failed", { code: payload.code ?? "unknown" });
        controller.enqueue(encoder.encode(`\n${STREAM_ERROR_MARK}${JSON.stringify(payload)}`));
        controller.close();
      }
    },
    async cancel() {
      // The learner closed the panel or navigated away: stop the model too.
      await iterator.return?.();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
