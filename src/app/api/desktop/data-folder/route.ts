import { spawn } from "node:child_process";
import { dataDir } from "@/db/client";
import { errorResponse, handleRouteError } from "@/server/http";

/**
 * Desktop app only: opens the data folder (database and .env) in Explorer.
 * Runs one fixed Windows program with the folder path; nothing from the
 * request is used.
 */
export async function POST() {
  if (!process.env.RETRACE_DESKTOP_SECRET || process.platform !== "win32") {
    return errorResponse(404, "Only available in the desktop app.");
  }
  try {
    spawn("explorer.exe", [dataDir()], { detached: true, stdio: "ignore" }).unref();
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error, "desktop.open_folder_failed");
  }
}
