import { generateRoadmap } from "@/server/ai/tasks/roadmap";
import { getEnv } from "@/server/env";
import { errorResponse, handleRouteError, parseId } from "@/server/http";
import { checkAiRateLimit } from "@/server/rate-limit";
import { listLevels } from "@/server/repo/projects";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const projectId = parseId((await context.params).id);
  if (!projectId) return errorResponse(404, "Project was not found.");
  try {
    checkAiRateLimit(getEnv().AI_RATE_LIMIT_PER_MIN);
    await generateRoadmap(projectId);
    return Response.json({ levels: listLevels(projectId) });
  } catch (error) {
    return handleRouteError(error, "roadmap.failed");
  }
}
