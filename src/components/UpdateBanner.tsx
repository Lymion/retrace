"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { type UpdateState, updatesBridge } from "@/lib/desktop-bridge";

// The update line under the title bar: shown only in the desktop app, and
// only once a new version is downloaded and ready (or installing). One click
// restarts on the new version; "later" hides it and the update installs the
// next time Retrace quits.

export function UpdateBanner() {
  const pathname = usePathname();
  const [state, setState] = useState<UpdateState | null>(null);
  const [later, setLater] = useState<string | null>(null);

  // Re-checked on screen changes, so a bridge that appears later is found.
  useEffect(() => updatesBridge()?.subscribe(setState), [pathname]);

  if (!state) return null;
  const installing = state.status === "installing";
  if (!installing && (state.status !== "ready" || later === state.version)) return null;

  return (
    <div
      role="status"
      className="c-warn flex flex-wrap items-center gap-x-3.5 gap-y-1 border-b border-border bg-[color-mix(in_srgb,var(--warn)_10%,var(--bg))] px-3 py-1 text-[13px]"
    >
      <span className="bg-warn px-1.5 font-bold text-bg">update</span>
      {installing ? (
        <span className="spinner text-muted">
          installing retrace {state.version}… Retrace will reopen by itself
        </span>
      ) : (
        <>
          <span>
            retrace <span className="text-bright">{state.version}</span> is downloaded and ready{" "}
            <span className="text-comment">· you have {state.current}</span>
          </span>
          <span className="ml-auto flex gap-1">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void updatesBridge()?.install()}
            >
              restart and update
            </button>
            <button type="button" className="btn" onClick={() => setLater(state.version ?? "")}>
              later
            </button>
          </span>
        </>
      )}
    </div>
  );
}
