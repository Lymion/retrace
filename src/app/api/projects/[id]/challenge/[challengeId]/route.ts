import { z } from "zod";
import { SubmittedFilesSchema } from "@/server/ai/tasks/rebuild";
import { revealHint, reviewChallenge, saveChallengeDraft } from "@/server/ai/tasks/remix";
import { getEnv } from "@/server/env";
import { errorResponse, handleRouteError, parseId, readJson } from "@/server/http";
import { checkAiRateLimit } from "@/server/rate-limit";

type Context = { params: Promise<{ id: string; challengeId: string }> };

async function ids(context: Context) {
  const params = await context.params;
  return { projectId: parseId(params.id), challengeId: parseId(params.challengeId) };
}

const DraftSchema = z.object({ files: SubmittedFilesSchema }).strict();

/** Autosave of the learner's attempt. */
export async function PUT(request: Request, context: Context) {
  const { projectId, challengeId } = await ids(context);
  if (!projectId || !challengeId) return errorResponse(404, "Challenge was not found.");
  const body = await readJson(request, DraftSchema);
  if (!body.ok) return body.response;
  try {
    return Response.json({
      challenge: saveChallengeDraft(projectId, challengeId, body.data.files),
    });
  } catch (error) {
    return handleRouteError(error, "challenge.draft_failed");
  }
}

const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("hint") }).strict(),
  z.object({ action: z.literal("review"), files: SubmittedFilesSchema }).strict(),
]);

/** { action: "hint" } reveals the next hint; { action: "review", files } submits the attempt. */
export async function POST(request: Request, context: Context) {
  const { projectId, challengeId } = await ids(context);
  if (!projectId || !challengeId) return errorResponse(404, "Challenge was not found.");
  const body = await readJson(request, ActionSchema);
  if (!body.ok) return body.response;
  try {
    if (body.data.action === "hint") {
      return Response.json({ challenge: revealHint(projectId, challengeId) });
    }
    checkAiRateLimit(getEnv().AI_RATE_LIMIT_PER_MIN);
    return Response.json({
      challenge: await reviewChallenge(projectId, challengeId, body.data.files),
    });
  } catch (error) {
    return handleRouteError(error, "challenge.action_failed");
  }
}
