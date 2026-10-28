import { handleRouteError } from "@/server/http";
import { listChecklist } from "@/server/ai/tasks/insights";

/** The learner's reusable "starting a new app" checklist, across all projects. */
export async function GET() {
  try {
    return Response.json({ items: listChecklist() });
  } catch (error) {
    return handleRouteError(error, "checklist.list_failed");
  }
}
