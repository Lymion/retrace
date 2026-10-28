"use client";

import { useState } from "react";
import { EmptyState, ErrorState } from "@/components/states";
import { apiFetch, errorMessage } from "@/lib/api-client";

// The reusable "starting a new app" checklist, built from every project's
// lessons and gaps. Ticking an item is saved straight away.

export interface ChecklistRow {
  id: number;
  title: string;
  whyItMatters: string;
  source: "gap" | "lesson";
  done: boolean;
}

export function Checklist({ items: initial }: { items: ChecklistRow[] }) {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function toggle(item: ChecklistRow) {
    setError(null);
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)));
    try {
      await apiFetch(`/api/checklist/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: !item.done }),
      });
    } catch (err) {
      setItems((list) => list.map((i) => (i.id === item.id ? { ...i, done: item.done } : i)));
      setError(errorMessage(err));
    }
  }

  const open = items.filter((i) => !i.done).length;

  return (
    <section aria-labelledby="checklist-heading" className="card space-y-3 p-5">
      <h2 id="checklist-heading" className="text-lg font-semibold">
        New-app checklist <span className="text-sm font-normal text-muted">· {open} open</span>
      </h2>
      <p className="text-sm text-muted">
        Collected from the lessons and gaps of every project you upload. Run through it whenever you
        start a new app.
      </p>
      {error && <ErrorState message={error} />}
      {items.length === 0 ? (
        <EmptyState title="Empty for now">
          Open a project and press &quot;Find lessons and gaps&quot; to start your checklist.
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={item.done}
                  onChange={() => toggle(item)}
                />
                <span className={item.done ? "text-muted line-through" : ""}>
                  {item.title}
                  <span className="block text-xs text-muted no-underline">
                    {item.source === "gap" ? "Gap" : "Lesson"} · {item.whyItMatters}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
