import { z } from "zod";
import { SubmittedFilesSchema, saveDraft } from "@/server/ai/tasks/rebuild";
import { errorResponse, handleRouteError, parseId, readJson } from "@/server/http";

type Context = { params: Promise<{ id: string; attemptId: string }> };

const DraftSchema = z.object({ files: SubmittedFilesSchema }).strict();

/** Saves the learner's files as a draft (the editor autosaves). */
export async function PUT(request: Request, context: Context) {
  const params = await context.params;
  const projectId = parseId(params.id);
  const attemptId = parseId(params.attemptId);
  if (!projectId || !attemptId) return errorResponse(404, "Rebuild attempt was not found.");
  const body = await readJson(request, DraftSchema);
  if (!body.ok) return body.response;
  try {
    return Response.json({ attempt: saveDraft(projectId, attemptId, body.data.files) });
  } catch (error) {
    return handleRouteError(error, "rebuild.draft_failed");
  }
}
