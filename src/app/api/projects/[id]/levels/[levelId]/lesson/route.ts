import { prepareLesson } from "@/server/ai/tasks/tutor";
import { streamText } from "@/server/ai/stream";
import { getEnv } from "@/server/env";
import { errorResponse, handleRouteError, parseId } from "@/server/http";
import { checkAiRateLimit } from "@/server/rate-limit";

type Context = { params: Promise<{ id: string; levelId: string }> };

/** Streams the Tour mode lesson for one level. */
export async function POST(request: Request, context: Context) {
  const params = await context.params;
  const projectId = parseId(params.id);
  const levelId = parseId(params.levelId);
  if (!projectId || !levelId) return errorResponse(404, "Level was not found.");
  try {
    checkAiRateLimit(getEnv().AI_RATE_LIMIT_PER_MIN);
    const task = prepareLesson(projectId, levelId);
    return await streamText(task.provider.stream(task.request, request.signal), {
      onComplete: task.save,
    });
  } catch (error) {
    return handleRouteError(error, "lesson.failed");
  }
}
