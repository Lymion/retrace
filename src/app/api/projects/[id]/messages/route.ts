import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { levels, messages } from "@/db/schema";
import { errorResponse, handleRouteError, parseId } from "@/server/http";
import { getProject } from "@/server/repo/projects";

type Context = { params: Promise<{ id: string }> };

/** The chat history for a project, oldest first, with each message's level number. */
export async function GET(_request: Request, context: Context) {
  const projectId = parseId((await context.params).id);
  if (!projectId) return errorResponse(404, "Project was not found.");
  try {
    getProject(projectId);
    const rows = getDb()
      .select({
        id: messages.id,
        role: messages.role,
        kind: messages.kind,
        content: messages.content,
        provider: messages.provider,
        levelNumber: levels.number,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .leftJoin(levels, eq(levels.id, messages.levelId))
      .where(eq(messages.projectId, projectId))
      .orderBy(asc(messages.createdAt), asc(messages.id))
      .all();
    return Response.json({ messages: rows.slice(-200) });
  } catch (error) {
    return handleRouteError(error, "messages.list_failed");
  }
}
