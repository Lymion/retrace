import { after } from "next/server";
import { errorFields, log } from "./logger";

/**
 * Runs background work once the response has been sent. Outside a Next.js
 * request (tests, scripts) `after` is not available, so the job just starts
 * without being awaited. Failures are logged, never thrown at the learner.
 */
export function afterResponse(event: string, job: () => Promise<unknown>): void {
  const run = () =>
    job().catch((error: unknown) => {
      log.warn(event, errorFields(error));
    });
  try {
    after(run);
  } catch {
    void run();
  }
}
