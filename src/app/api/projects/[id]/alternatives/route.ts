import { getDb } from "@/db/client";
import { generateAlternatives, listAlternatives } from "@/server/ai/tasks/insights";
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
    return Response.json({ decisions: listAlternatives(getDb(), projectId) });
  } catch (error) {
    return handleRouteError(error, "alternatives.list_failed");
  }
}

export async function POST(_request: Request, context: Context) {
  const projectId = parseId((await context.params).id);
  if (!projectId) return errorResponse(404, "Project was not found.");
  try {
    getProject(projectId);
    checkAiRateLimit(getEnv().AI_RATE_LIMIT_PER_MIN);
    return Response.json({ decisions: await generateAlternatives(projectId) });
  } catch (error) {
    return handleRouteError(error, "alternatives.generate_failed");
  }
}
