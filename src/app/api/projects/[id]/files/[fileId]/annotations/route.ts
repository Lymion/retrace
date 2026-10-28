import { z } from "zod";
import { DEPTHS } from "@/shared/enums";
import { annotateFile, listAnnotations } from "@/server/ai/tasks/annotate";
import { getEnv } from "@/server/env";
import { errorResponse, handleRouteError, parseId, readJson } from "@/server/http";
import { checkAiRateLimit } from "@/server/rate-limit";
import { getFileContent } from "@/server/repo/projects";
import { getSettings } from "@/server/settings";

type Context = { params: Promise<{ id: string; fileId: string }> };

const DepthParam = z.enum(DEPTHS);

async function ids(context: Context) {
  const params = await context.params;
  return { projectId: parseId(params.id), fileId: parseId(params.fileId) };
}

/** Cached notes only; never calls the AI. */
export async function GET(request: Request, context: Context) {
  const { projectId, fileId } = await ids(context);
  if (!projectId || !fileId) return errorResponse(404, "File was not found.");
  const depth = DepthParam.safeParse(new URL(request.url).searchParams.get("depth"));
  try {
    getFileContent(projectId, fileId); // 404s if the file is not in this project
    const chosen = depth.success ? depth.data : getSettings().depth;
    return Response.json({ depth: chosen, annotations: listAnnotations(fileId, chosen) });
  } catch (error) {
    return handleRouteError(error, "annotations.get_failed");
  }
}

const GenerateSchema = z.object({
  depth: DepthParam.optional(),
  regenerate: z.boolean().optional(),
});

/** Writes notes with the AI (or returns the cached ones). */
export async function POST(request: Request, context: Context) {
  const { projectId, fileId } = await ids(context);
  if (!projectId || !fileId) return errorResponse(404, "File was not found.");
  const body = await readJson(request, GenerateSchema);
  if (!body.ok) return body.response;
  try {
    const depth = body.data.depth ?? getSettings().depth;
    const cached = listAnnotations(fileId, depth);
    if (cached.length === 0 || body.data.regenerate)
      checkAiRateLimit(getEnv().AI_RATE_LIMIT_PER_MIN);
    const annotations = await annotateFile(projectId, fileId, {
      depth,
      regenerate: body.data.regenerate,
    });
    return Response.json({ depth, annotations });
  } catch (error) {
    return handleRouteError(error, "annotations.generate_failed");
  }
}
