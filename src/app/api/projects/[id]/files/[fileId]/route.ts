import { errorResponse, handleRouteError, parseId } from "@/server/http";
import { getFileContent } from "@/server/repo/projects";

type Context = { params: Promise<{ id: string; fileId: string }> };

export async function GET(_request: Request, context: Context) {
  const params = await context.params;
  const projectId = parseId(params.id);
  const fileId = parseId(params.fileId);
  if (!projectId || !fileId) return errorResponse(404, "File was not found.");
  try {
    const file = getFileContent(projectId, fileId);
    return Response.json({
      file: {
        id: file.id,
        path: file.path,
        language: file.language,
        layer: file.layer,
        levelId: file.levelId,
        lineCount: file.lineCount,
        content: file.content,
      },
    });
  } catch (error) {
    return handleRouteError(error, "file.get_failed");
  }
}
