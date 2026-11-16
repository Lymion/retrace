"use client";

import { useEffect, useState } from "react";
import { type UpdateState, updatesBridge } from "@/lib/desktop-bridge";

// Settings → Desktop app: the update state, "check now", and the switch for
// automatic checks (saved as the autoUpdate setting).

const LABEL: Record<UpdateState["status"], string> = {
  idle: "up to date",
  checking: "checking…",
  downloading: "downloading",
  ready: "ready to install",
  installing: "installing…",
  error: "could not check (offline, or no release yet)",
};

export function UpdateControls({
  autoUpdate,
  onAutoUpdate,
}: {
  autoUpdate: boolean;
  onAutoUpdate: (value: boolean) => void;
}) {
  const [state, setState] = useState<UpdateState | null>(null);
  useEffect(() => updatesBridge()?.subscribe(setState), []);

  return (
    <div className="space-y-2 text-sm">
      <p aria-live="polite">
        Updates:{" "}
        <span className="text-number">
          {state ? LABEL[state.status] : "not checked yet"}
          {state?.status === "downloading" && ` ${state.percent ?? 0}%`}
          {state?.version && state.status !== "idle" && ` · ${state.version}`}
        </span>
        {state?.checkedAt && (
          <span className="text-comment">
            {" "}
            · last check {new Date(state.checkedAt).toLocaleTimeString("en-GB")}
          </span>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" className="btn" onClick={() => void updatesBridge()?.check()}>
          check now
        </button>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={autoUpdate}
            onChange={(event) => onAutoUpdate(event.target.checked)}
          />
          check for updates automatically
        </label>
      </div>
      <p className="text-xs text-comment">
        The check asks GitHub whether a newer Retrace exists. It sends nothing about your projects.
        Turn it off here; you can still use &ldquo;check now&rdquo;.
      </p>
    </div>
  );
}
