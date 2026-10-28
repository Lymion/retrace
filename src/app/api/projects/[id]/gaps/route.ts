import { getDb } from "@/db/client";
import { generateGaps, getGapsReport } from "@/server/ai/tasks/insights";
import { getEnv } from "@/server/env";
import { errorResponse, handleRouteError, parseId } from "@/server/http";
import { checkAiRateLimit } from "@/server/rate-limit";
import { getProject } from "@/server/repo/projects";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const projectId = parseId((await context.params).id);
  if (!projectId) return errorResponse(404, "Project was not found.");
  try {
    getProject(projectId);
    return Response.json({ report: getGapsReport(getDb(), projectId) });
  } catch (error) {
    return handleRouteError(error, "gaps.get_failed");
  }
}

/** Writes lessons and gaps, and adds new items to the reusable checklist. */
export async function POST(_request: Request, context: Context) {
  const projectId = parseId((await context.params).id);
  if (!projectId) return errorResponse(404, "Project was not found.");
  try {
    getProject(projectId);
    checkAiRateLimit(getEnv().AI_RATE_LIMIT_PER_MIN);
    await generateGaps(projectId);
    return Response.json({ report: getGapsReport(getDb(), projectId) });
  } catch (error) {
    return handleRouteError(error, "gaps.generate_failed");
  }
}
