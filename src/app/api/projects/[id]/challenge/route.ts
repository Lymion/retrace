import { getDb } from "@/db/client";
import { createChallenge, latestChallenge } from "@/server/ai/tasks/remix";
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
    return Response.json({ challenge: latestChallenge(getDb(), projectId) });
  } catch (error) {
    return handleRouteError(error, "challenge.get_failed");
  }
}

export async function POST(_request: Request, context: Context) {
  const projectId = parseId((await context.params).id);
  if (!projectId) return errorResponse(404, "Project was not found.");
  try {
    getProject(projectId);
    checkAiRateLimit(getEnv().AI_RATE_LIMIT_PER_MIN);
    return Response.json({ challenge: await createChallenge(projectId) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "challenge.create_failed");
  }
}
