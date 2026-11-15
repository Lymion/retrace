import { gte, sql } from "drizzle-orm";
import { type Db, getDb } from "@/db/client";
import { aiUsage } from "@/db/schema";
import type { ProviderId } from "@/shared/enums";
import { log } from "../logger";

// What each model call cost, in tokens. Only counts are stored, never any
// prompt, code or reply text. The status line and Settings read the totals.

export interface UsageReport {
  task: string;
  provider: ProviderId;
  model: string;
  /** Input tokens billed at the full rate (not read from or written to the cache). */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** The token counters both SDKs report, with their API field names. */
export interface RawUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export function toReport(
  base: Pick<UsageReport, "task" | "provider" | "model">,
  raw: RawUsage | null | undefined,
): UsageReport {
  return {
    ...base,
    inputTokens: raw?.input_tokens ?? 0,
    outputTokens: raw?.output_tokens ?? 0,
    cacheReadTokens: raw?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: raw?.cache_creation_input_tokens ?? 0,
  };
}

/** Saves one call's counts. A failure here must never break the answer itself. */
export function recordUsage(report: UsageReport, db: Db = getDb()): void {
  try {
    db.insert(aiUsage).values(report).run();
  } catch (error) {
    log.warn("ai.usage_not_saved", { task: report.task, message: (error as Error).message });
  }
}

export interface UsageTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface UsageSummary {
  today: UsageTotals;
  week: UsageTotals;
  /** The last 7 days by task, largest first. */
  byTask: (UsageTotals & { task: string })[];
}

const totals = {
  calls: sql<number>`count(*)`,
  inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)`,
  outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)`,
  cacheReadTokens: sql<number>`coalesce(sum(${aiUsage.cacheReadTokens}), 0)`,
  cacheWriteTokens: sql<number>`coalesce(sum(${aiUsage.cacheWriteTokens}), 0)`,
};

export function usageSummary(db: Db = getDb(), now = new Date()): UsageSummary {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const empty: UsageTotals = {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  const since = (from: Date) =>
    db.select(totals).from(aiUsage).where(gte(aiUsage.createdAt, from)).get() ?? empty;
  const byTask = db
    .select({ task: aiUsage.task, ...totals })
    .from(aiUsage)
    .where(gte(aiUsage.createdAt, weekAgo))
    .groupBy(aiUsage.task)
    .all()
    .sort(
      (a, b) =>
        b.inputTokens +
        b.outputTokens +
        b.cacheReadTokens -
        (a.inputTokens + a.outputTokens + a.cacheReadTokens),
    );
  return { today: since(startOfDay), week: since(weekAgo), byTask };
}

/** Share of input that came from the cache, 0 to 100. */
export function cachedPercent(t: UsageTotals): number {
  const all = t.inputTokens + t.cacheReadTokens + t.cacheWriteTokens;
  return all === 0 ? 0 : Math.round((t.cacheReadTokens / all) * 100);
}
