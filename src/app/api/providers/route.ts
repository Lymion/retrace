import { getProviders } from "@/server/ai/registry";
import { handleRouteError } from "@/server/http";
import { getSettings } from "@/server/settings";

// Each provider's readiness. `?fresh=1` re-checks instead of using the
// short-lived cache (the Claude login check starts a process).
export async function GET(request: Request) {
  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  try {
    const providers = await Promise.all(Object.values(getProviders()).map((p) => p.status(fresh)));
    return Response.json({ active: getSettings().activeProvider, providers });
  } catch (error) {
    return handleRouteError(error, "providers.status_failed");
  }
}
