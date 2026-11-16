"use client";

import { ErrorState, Spinner } from "@/components/states";
import {
  type UsageSummaryView,
  type UsageTotalsView,
  cachedShare,
  formatTokens,
  totalTokens,
} from "@/lib/tokens";
import { useFetch } from "@/lib/use-fetch";

// What the tutor cost in tokens: today, the last 7 days, and per task.
// Only counts are stored, never any prompt, code or reply.

function Row({ label, t }: { label: string; t: UsageTotalsView }) {
  return (
    <tr className="border-t border-border">
      <th scope="row" className="py-1.5 pr-3 text-left font-normal">
        {label}
      </th>
      <td className="px-2 text-right tabular-nums">{t.calls}</td>
      <td className="px-2 text-right tabular-nums">
        {formatTokens(t.inputTokens + t.cacheWriteTokens)}
      </td>
      <td className="px-2 text-right tabular-nums">{formatTokens(t.cacheReadTokens)}</td>
      <td className="px-2 text-right tabular-nums">{formatTokens(t.outputTokens)}</td>
      <td className="pl-2 text-right tabular-nums text-number">{formatTokens(totalTokens(t))}</td>
    </tr>
  );
}

export function UsagePanel() {
  const { data, error, loading, reload } = useFetch<{ usage: UsageSummaryView }>("/api/usage");
  const usage = data?.usage;

  return (
    <section className="card c-cyan space-y-3 p-5" aria-labelledby="usage-heading">
      <h2 id="usage-heading" className="text-lg font-semibold">
        Token use
      </h2>
      <p className="text-sm text-muted">
        Counted for every tutor call on this computer. Cached input is billed at about a tenth of
        the normal rate.
      </p>
      {loading && <Spinner label="Loading token counts" />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {usage && (
        <>
          <p className="text-sm">
            Today <span className="text-number">{formatTokens(totalTokens(usage.today))}</span> ·
            last 7 days <span className="text-number">{formatTokens(totalTokens(usage.week))}</span>{" "}
            · {cachedShare(usage.week)}% of input from the cache
          </p>
          {usage.byTask.length === 0 ? (
            <p className="text-sm text-comment">No tutor calls in the last 7 days.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Tokens by task, last 7 days</caption>
                <thead className="text-xs text-comment">
                  <tr>
                    <th scope="col" className="pb-1 text-left font-normal">
                      task (7 days)
                    </th>
                    <th scope="col" className="px-2 text-right font-normal">
                      calls
                    </th>
                    <th scope="col" className="px-2 text-right font-normal">
                      input
                    </th>
                    <th scope="col" className="px-2 text-right font-normal">
                      cached
                    </th>
                    <th scope="col" className="px-2 text-right font-normal">
                      output
                    </th>
                    <th scope="col" className="pl-2 text-right font-normal">
                      total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {usage.byTask.map((row) => (
                    <Row key={row.task} label={row.task} t={row} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
