import { errorResponse, handleRouteError, parseId } from "@/server/http";
import {
  deleteProject,
  getProject,
  listFiles,
  listLevels,
  listRedactions,
} from "@/server/repo/projects";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const projectId = parseId((await context.params).id);
  if (!projectId) return errorResponse(404, "Project was not found.");
  try {
    return Response.json({
      project: getProject(projectId),
      files: listFiles(projectId),
      levels: listLevels(projectId),
      redactions: listRedactions(projectId),
    });
  } catch (error) {
    return handleRouteError(error, "project.get_failed");
  }
}

export async function DELETE(_request: Request, context: Context) {
  const projectId = parseId((await context.params).id);
  if (!projectId) return errorResponse(404, "Project was not found.");
  try {
    deleteProject(projectId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error, "project.delete_failed");
  }
}
