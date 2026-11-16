import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { BrowserWindow, app, dialog, session, shell } from "electron";
import { startUpdater } from "./updater";

// Retrace as a desktop app. The main process starts the Next.js server as a
// child process on 127.0.0.1 with a free port, waits until it answers, then
// opens one window on it. Quitting stops the server.
//
// `--dev` (npm run desktop:dev) skips the server and opens the dev server
// on http://127.0.0.1:3000 instead.

const DEV = process.argv.includes("--dev");
const DEV_URL = "http://127.0.0.1:3000";
const COOKIE = "retrace_desktop";
const BG = "#0f1117";

let server: ChildProcess | null = null;
let win: BrowserWindow | null = null;
let origin = DEV_URL;
let serverSecret = "";
let quitting = false;

// One Retrace at a time: a second launch focuses the window that is open.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(start, (error: unknown) => fail(error));
}

/** Where the database, temp files and .env live: %APPDATA%\Retrace. */
function dataDir(): string {
  const dir = app.getPath("userData");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** KEY=value lines from the data folder's .env. Values are never logged. */
function readEnvFile(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    out[match[1]!] = match[2]!.replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() =>
        typeof address === "object" && address ? resolve(address.port) : reject(),
      );
    });
  });
}

async function waitForHealth(url: string, secret: string, timeoutMs = 60_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (server?.exitCode !== null && server?.exitCode !== undefined) {
      throw new Error(`The Retrace server stopped while starting (exit code ${server.exitCode}).`);
    }
    try {
      const response = await fetch(`${url}/api/health`, {
        headers: { cookie: `${COOKIE}=${secret}` },
      });
      if (response.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("The Retrace server did not start within a minute.");
}

/**
 * First launch only: offer to copy projects from an older Retrace folder
 * (the data/ folder beside the source code). The original is never touched.
 */
async function offerOldData(dir: string): Promise<void> {
  if (existsSync(path.join(dir, "retrace.db"))) return;
  const answer = await dialog.showMessageBox({
    type: "question",
    buttons: ["Choose folder…", "Start fresh"],
    defaultId: 1,
    cancelId: 1,
    title: "Retrace",
    message: "Bring your projects from an earlier Retrace?",
    detail:
      "If you used Retrace from its source folder before, choose its data folder (the one with retrace.db) to copy your projects and progress. The original folder is left as it is.",
  });
  if (answer.response !== 0) return;
  const picked = await dialog.showOpenDialog({
    title: "Choose the old Retrace data folder",
    properties: ["openDirectory"],
  });
  const from = picked.filePaths[0];
  if (picked.canceled || !from) return;
  if (!existsSync(path.join(from, "retrace.db"))) {
    await dialog.showMessageBox({
      type: "warning",
      message: "No retrace.db in that folder, so nothing was copied.",
    });
    return;
  }
  for (const name of ["retrace.db", "retrace.db-wal", "retrace.db-shm"]) {
    if (existsSync(path.join(from, name)))
      copyFileSync(path.join(from, name), path.join(dir, name));
  }
}

/**
 * The first launch of a new version backs up the database before the server
 * applies its migrations: retrace.db.bak-<old version>, in the data folder.
 */
function backupBeforeUpgrade(dir: string) {
  const marker = path.join(dir, "last-version.txt");
  const previous = existsSync(marker) ? readFileSync(marker, "utf8").trim() : null;
  const current = app.getVersion();
  const db = path.join(dir, "retrace.db");
  if (previous && previous !== current && existsSync(db)) {
    copyFileSync(db, path.join(dir, `retrace.db.bak-${previous}`));
  }
  writeFileSync(marker, current);
}

async function startServer(): Promise<{ url: string; secret: string }> {
  const dir = dataDir();
  await offerOldData(dir);
  backupBeforeUpgrade(dir);
  const port = await freePort();
  const secret = randomBytes(32).toString("hex");
  const serverDir = path.join(process.resourcesPath, "server");
  const fileEnv = readEnvFile(path.join(dir, ".env"));

  server = spawn(process.execPath, [path.join(serverDir, "server.js")], {
    cwd: serverDir,
    windowsHide: true,
    stdio: ["ignore", "ignore", "pipe"],
    env: {
      ...process.env,
      ...fileEnv,
      // Electron's own binary runs the server as plain Node.
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      RETRACE_DATA_DIR: dir,
      RETRACE_DESKTOP_SECRET: secret,
      RETRACE_APP_VERSION: app.getVersion(),
    },
  });
  // Keep only the last bit of error output, for the error window.
  let lastError = "";
  server.stderr?.on("data", (chunk: Buffer) => {
    lastError = (lastError + chunk.toString()).slice(-2000);
  });
  server.on("exit", (code) => {
    server = null;
    if (!quitting && code !== 0)
      fail(new Error(`The Retrace server stopped (exit code ${code}).`), lastError);
  });

  const url = `http://127.0.0.1:${port}`;
  await waitForHealth(url, secret);
  return { url, secret };
}

function lockDown(window: BrowserWindow) {
  const contents = window.webContents;
  // Only the local server is shown in the window; links elsewhere open in the browser.
  contents.on("will-navigate", (event, url) => {
    if (new URL(url).origin === origin) return;
    event.preventDefault();
    if (/^https?:/.test(url)) void shell.openExternal(url);
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url) && new URL(url).origin !== origin) void shell.openExternal(url);
    return { action: "deny" };
  });
  contents.on("will-attach-webview", (event) => event.preventDefault());
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false),
  );
}

async function start() {
  try {
    if (!DEV) {
      const { url, secret } = await startServer();
      origin = url;
      serverSecret = secret;
      await session.defaultSession.cookies.set({
        url,
        name: COOKIE,
        value: secret,
        httpOnly: true,
        sameSite: "strict",
      });
    }
    win = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 420,
      minHeight: 500,
      backgroundColor: BG,
      title: "Retrace",
      show: false,
      // The terminal top bar is the title bar; Windows draws its buttons on the right.
      titleBarStyle: "hidden",
      titleBarOverlay: { color: "#151821", symbolColor: "#a7aebb", height: 40 },
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webviewTag: false,
        spellcheck: false,
        preload: path.join(__dirname, "preload.js"),
      },
    });
    lockDown(win);
    win.once("ready-to-show", () => win?.show());
    win.on("closed", () => (win = null));
    await win.loadURL(origin);
    if (app.isPackaged && !DEV) {
      startUpdater(win, {
        origin,
        // The learner can turn automatic checks off in Settings.
        autoCheck: async () => {
          const response = await fetch(`${origin}/api/settings`, {
            headers: { cookie: `${COOKIE}=${serverSecret}` },
          });
          const body = (await response.json()) as { settings?: { autoUpdate?: boolean } };
          return body.settings?.autoUpdate !== false;
        },
        beforeInstall: shutdownServer,
      });
    }
  } catch (error) {
    fail(error);
  }
}

function fail(error: unknown, detail = "") {
  const message = error instanceof Error ? error.message : String(error);
  dialog.showErrorBox(
    "Retrace could not start",
    `${message}\n\n${detail ? `Last output from the server:\n${detail}\n\n` : ""}Your projects are safe in ${app.getPath("userData")}.`,
  );
  app.quit();
}

function stopServer() {
  if (server && server.exitCode === null) server.kill();
  server = null;
}

app.on("before-quit", () => {
  quitting = true;
  stopServer();
});
app.on("window-all-closed", () => app.quit());

/** Used by the updater: stop the server cleanly before an update installs. */
function shutdownServer() {
  quitting = true;
  stopServer();
}
