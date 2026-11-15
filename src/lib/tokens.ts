// Formatting for token counts, shared by the status line and Settings.

export interface UsageTotalsView {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface UsageSummaryView {
  today: UsageTotalsView;
  week: UsageTotalsView;
  byTask: (UsageTotalsView & { task: string })[];
}

/** Every token the calls used, cached or not. */
export function totalTokens(t: UsageTotalsView): number {
  return t.inputTokens + t.outputTokens + t.cacheReadTokens + t.cacheWriteTokens;
}

/** Share of input that came from the cache, 0 to 100. */
export function cachedShare(t: UsageTotalsView): number {
  const input = t.inputTokens + t.cacheReadTokens + t.cacheWriteTokens;
  return input === 0 ? 0 : Math.round((t.cacheReadTokens / input) * 100);
}

/** 950 → "950", 12_400 → "12.4k", 2_300_000 → "2.3M". */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

/** Fired after any AI call finishes, so the status line can refresh its count. */
export const USAGE_EVENT = "retrace:usage";

export function announceUsage(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(USAGE_EVENT));
}

/**
 * A rough cost for a lesson, before it is written: the level's code (at most
 * the 800 lines sent in full), plus the prompt and fact sheet, plus the reply.
 * Shown with a "~" because the real number depends on the model.
 */
export function estimateLessonTokens(levelLines: number): number {
  return Math.min(levelLines, 800) * 10 + 3000 + 2500;
}
