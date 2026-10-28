import { createRebuildSpec, getLatestAttempt, parseAttempt } from "@/server/ai/tasks/rebuild";
import { getDb } from "@/db/client";
import { getEnv } from "@/server/env";
import { errorResponse, handleRouteError, parseId } from "@/server/http";
import { checkAiRateLimit } from "@/server/rate-limit";
import { getProject } from "@/server/repo/projects";

type Context = { params: Promise<{ id: string; levelId: string }> };

async function ids(context: Context) {
  const params = await context.params;
  return { projectId: parseId(params.id), levelId: parseId(params.levelId) };
}

/** The latest rebuild attempt for a level (spec, draft files, review), or null. */
export async function GET(_request: Request, context: Context) {
  const { projectId, levelId } = await ids(context);
  if (!projectId || !levelId) return errorResponse(404, "Level was not found.");
  try {
    getProject(projectId);
    const row = getLatestAttempt(getDb(), levelId);
    return Response.json({
      attempt: row && row.projectId === projectId ? parseAttempt(row) : null,
    });
  } catch (error) {
    return handleRouteError(error, "rebuild.get_failed");
  }
}

/** Starts a new attempt with a fresh spec. */
export async function POST(_request: Request, context: Context) {
  const { projectId, levelId } = await ids(context);
  if (!projectId || !levelId) return errorResponse(404, "Level was not found.");
  try {
    checkAiRateLimit(getEnv().AI_RATE_LIMIT_PER_MIN);
    return Response.json({ attempt: await createRebuildSpec(projectId, levelId) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "rebuild.spec_failed");
  }
}
