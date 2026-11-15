import { usageSummary } from "@/server/ai/usage";
import { handleRouteError } from "@/server/http";

/** Token counts for today, the last 7 days, and the last 7 days by task. No text, only numbers. */
export async function GET() {
  try {
    return Response.json({ usage: usageSummary() });
  } catch (error) {
    return handleRouteError(error, "usage.get_failed");
  }
}
