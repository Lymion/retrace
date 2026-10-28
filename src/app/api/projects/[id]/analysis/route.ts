import { ProjectAnalysisSchema } from "@/shared/analysis";
import { errorResponse, handleRouteError, parseId } from "@/server/http";
import { getProject } from "@/server/repo/projects";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const projectId = parseId((await context.params).id);
  if (!projectId) return errorResponse(404, "Project was not found.");
  try {
    const project = getProject(projectId);
    const parsed = ProjectAnalysisSchema.safeParse(project.analysis);
    if (!parsed.success)
      return errorResponse(409, "This project has not been analysed yet.", "no_analysis");
    return Response.json({ analysis: parsed.data });
  } catch (error) {
    return handleRouteError(error, "analysis.get_failed");
  }
}
