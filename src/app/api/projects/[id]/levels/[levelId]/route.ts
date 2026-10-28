import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { levels } from "@/db/schema";
import { LEVEL_STATUSES } from "@/shared/enums";
import { errorResponse, handleRouteError, notFound, parseId, readJson } from "@/server/http";

type Context = { params: Promise<{ id: string; levelId: string }> };

const PatchSchema = z.object({ status: z.enum(LEVEL_STATUSES) }).strict();

/** Progress on a level, e.g. the learner confirming they passed its checkpoint. */
export async function PATCH(request: Request, context: Context) {
  const params = await context.params;
  const projectId = parseId(params.id);
  const levelId = parseId(params.levelId);
  if (!projectId || !levelId) return errorResponse(404, "Level was not found.");
  const body = await readJson(request, PatchSchema);
  if (!body.ok) return body.response;
  try {
    const db = getDb();
    const level = db
      .update(levels)
      .set({
        status: body.data.status,
        completedAt: body.data.status === "done" ? new Date() : null,
      })
      .where(and(eq(levels.id, levelId), eq(levels.projectId, projectId)))
      .returning()
      .get();
    if (!level) throw notFound("Level");
    return Response.json({ level });
  } catch (error) {
    return handleRouteError(error, "level.update_failed");
  }
}
