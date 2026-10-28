import { z } from "zod";
import { SubmittedFilesSchema, reviewRebuild } from "@/server/ai/tasks/rebuild";
import { getEnv } from "@/server/env";
import { errorResponse, handleRouteError, parseId, readJson } from "@/server/http";
import { checkAiRateLimit } from "@/server/rate-limit";

type Context = { params: Promise<{ id: string; attemptId: string }> };

const SubmitSchema = z.object({ files: SubmittedFilesSchema }).strict();

/** Submits the learner's files and returns the review. */
export async function POST(request: Request, context: Context) {
  const params = await context.params;
  const projectId = parseId(params.id);
  const attemptId = parseId(params.attemptId);
  if (!projectId || !attemptId) return errorResponse(404, "Rebuild attempt was not found.");
  const body = await readJson(request, SubmitSchema);
  if (!body.ok) return body.response;
  try {
    checkAiRateLimit(getEnv().AI_RATE_LIMIT_PER_MIN);
    return Response.json({ attempt: await reviewRebuild(projectId, attemptId, body.data.files) });
  } catch (error) {
    return handleRouteError(error, "rebuild.review_failed");
  }
}
