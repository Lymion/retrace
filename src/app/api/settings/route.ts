import { getProvider } from "@/server/ai/registry";
import { errorResponse, handleRouteError, readJson } from "@/server/http";
import { SettingsPatchSchema, getSettings, updateSettings } from "@/server/settings";

export async function GET() {
  try {
    return Response.json({ settings: getSettings() });
  } catch (error) {
    return handleRouteError(error, "settings.get_failed");
  }
}

export async function PATCH(request: Request) {
  const body = await readJson(request, SettingsPatchSchema);
  if (!body.ok) return body.response;
  try {
    // A provider that is not ready can never become the active one.
    if (body.data.activeProvider) {
      const status = await getProvider(body.data.activeProvider).status();
      if (!status.ready) {
        return errorResponse(
          409,
          `${status.label} is not ready. ${status.fix ?? status.detail}`,
          "provider_not_ready",
        );
      }
    }
    return Response.json({ settings: updateSettings(body.data) });
  } catch (error) {
    return handleRouteError(error, "settings.update_failed");
  }
}
