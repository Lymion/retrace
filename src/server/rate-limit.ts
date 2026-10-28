import { HttpError } from "./http";

// A token bucket for AI routes: up to `perMinute` requests, refilled
// smoothly. One learner on one machine, so a single in-memory bucket is
// enough. It protects the learner's quota from a runaway loop or a double click.

export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly capacity: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = capacity;
    this.last = now();
  }

  take(): boolean {
    const current = this.now();
    const refill = ((current - this.last) / 60_000) * this.capacity;
    this.tokens = Math.min(this.capacity, this.tokens + refill);
    this.last = current;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

const globalForLimit = globalThis as typeof globalThis & { __retraceAiBucket?: TokenBucket };

export function checkAiRateLimit(perMinute: number): void {
  globalForLimit.__retraceAiBucket ??= new TokenBucket(perMinute);
  if (!globalForLimit.__retraceAiBucket.take()) {
    throw new HttpError(
      429,
      "Too many AI requests in a minute. Wait a few seconds and try again.",
      "rate_limited",
    );
  }
}

export function resetRateLimitForTests(): void {
  globalForLimit.__retraceAiBucket = undefined;
}
