import { contextBridge, ipcRenderer } from "electron";

// The only bridge between the page and the main process: update state, and
// the two update actions. The page gets no other access to the computer.

type State = {
  status: string;
  current: string;
  version?: string;
  percent?: number;
  checkedAt?: string;
};

contextBridge.exposeInMainWorld("retrace", {
  updates: {
    /** Calls back with the current state now and whenever it changes. Returns an unsubscribe function. */
    subscribe(callback: (state: State) => void): () => void {
      const listener = (_event: unknown, state: State) => callback(state);
      ipcRenderer.on("update:state", listener);
      void ipcRenderer.invoke("update:get").then((state: State | null) => state && callback(state));
      return () => ipcRenderer.removeListener("update:state", listener);
    },
    /** Restart and install a downloaded update. */
    install: (): Promise<void> => ipcRenderer.invoke("update:install"),
    /** Look for an update now (the Settings button). */
    check: (): Promise<void> => ipcRenderer.invoke("update:check"),
  },
});
