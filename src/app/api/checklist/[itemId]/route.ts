import { z } from "zod";
import { setChecklistDone } from "@/server/ai/tasks/insights";
import { errorResponse, handleRouteError, parseId, readJson } from "@/server/http";

type Context = { params: Promise<{ itemId: string }> };

const PatchSchema = z.object({ done: z.boolean() }).strict();

export async function PATCH(request: Request, context: Context) {
  const itemId = parseId((await context.params).itemId);
  if (!itemId) return errorResponse(404, "Checklist item was not found.");
  const body = await readJson(request, PatchSchema);
  if (!body.ok) return body.response;
  try {
    return Response.json({ item: setChecklistDone(itemId, body.data.done) });
  } catch (error) {
    return handleRouteError(error, "checklist.update_failed");
  }
}
