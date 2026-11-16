// The desktop app's preload (electron/preload.ts) puts `window.retrace` on
// the page. In a plain browser it is missing, and everything here is a no-op.

export type UpdateStatus = "idle" | "checking" | "downloading" | "ready" | "installing" | "error";

export interface UpdateState {
  status: UpdateStatus;
  current: string;
  version?: string;
  percent?: number;
  checkedAt?: string;
}

export interface UpdatesBridge {
  subscribe(callback: (state: UpdateState) => void): () => void;
  install(): Promise<void>;
  check(): Promise<void>;
}

export function updatesBridge(): UpdatesBridge | null {
  if (typeof window === "undefined") return null;
  return (window as { retrace?: { updates?: UpdatesBridge } }).retrace?.updates ?? null;
}
