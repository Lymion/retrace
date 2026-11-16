import { type BrowserWindow, app, ipcMain } from "electron";
import { autoUpdater } from "electron-updater";

// Automatic updates from GitHub Releases. The app checks on launch and every
// few hours, downloads a new version in the background, and tells the page
// when it is ready; one click installs it and reopens the app. A failed or
// offline check shows nothing and is tried again at the next check.
//
// Each download is checked against the hash in the release, over HTTPS. The
// app is unsigned, so it cannot also check who built the update.

export type UpdateStatus = "idle" | "checking" | "downloading" | "ready" | "installing" | "error";

export interface UpdateState {
  status: UpdateStatus;
  current: string;
  /** The new version, once one is found. */
  version?: string;
  /** Download progress, 0 to 100. */
  percent?: number;
  /** When the last check finished, as an ISO time. */
  checkedAt?: string;
}

const EVERY = 4 * 60 * 60 * 1000;

let state: UpdateState = { status: "idle", current: app.getVersion() };
let window: BrowserWindow | null = null;

function set(next: Partial<UpdateState>) {
  state = { ...state, ...next };
  window?.webContents.send("update:state", state);
}

export interface UpdaterOptions {
  /** The local server's address: only that page may use the update channel. */
  origin: string;
  /** Reads the learner's "check automatically" setting. */
  autoCheck: () => Promise<boolean>;
  /** Stops the local server before the installer runs. */
  beforeInstall: () => void;
}

export function startUpdater(win: BrowserWindow, options: UpdaterOptions) {
  window = win;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true; // "later" installs on the next quit
  autoUpdater.logger = null; // nothing about the learner is logged

  autoUpdater.on("checking-for-update", () => set({ status: "checking" }));
  autoUpdater.on("update-not-available", () =>
    set({ status: "idle", checkedAt: new Date().toISOString() }),
  );
  autoUpdater.on("update-available", (info) =>
    set({ status: "downloading", version: info.version, percent: 0 }),
  );
  autoUpdater.on("download-progress", (progress) =>
    set({ status: "downloading", percent: Math.round(progress.percent) }),
  );
  autoUpdater.on("update-downloaded", (info) =>
    set({ status: "ready", version: info.version, checkedAt: new Date().toISOString() }),
  );
  autoUpdater.on("error", () => {
    // Offline, no release feed, or a failed download: keep quiet, retry later.
    if (state.status !== "ready") set({ status: "error", checkedAt: new Date().toISOString() });
  });

  const check = () => {
    if (state.status === "downloading" || state.status === "ready" || state.status === "installing")
      return;
    autoUpdater.checkForUpdates().catch(() => undefined);
  };

  // Only the app's own page may ask, never anything else that ends up loaded.
  const fromApp = (event: Electron.IpcMainInvokeEvent) => {
    try {
      return new URL(event.senderFrame?.url ?? "").origin === options.origin;
    } catch {
      return false;
    }
  };
  ipcMain.handle("update:get", (event) => (fromApp(event) ? state : null));
  ipcMain.handle("update:check", (event) => {
    if (fromApp(event)) check();
  });
  ipcMain.handle("update:install", (event) => {
    if (!fromApp(event) || state.status !== "ready") return;
    set({ status: "installing" });
    options.beforeInstall();
    // Silent install, then start the new version.
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
  });

  const scheduled = async () => {
    if (await options.autoCheck().catch(() => true)) check();
  };
  void scheduled();
  setInterval(() => void scheduled(), EVERY).unref();
}
