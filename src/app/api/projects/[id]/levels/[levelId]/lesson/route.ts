import { z } from "zod";
import { getDb } from "@/db/client";
import { prepareLesson, savedLesson } from "@/server/ai/tasks/tutor";
import { streamText } from "@/server/ai/stream";
import { getEnv } from "@/server/env";
import { errorResponse, handleRouteError, parseId } from "@/server/http";
import { checkAiRateLimit } from "@/server/rate-limit";
import { getProject } from "@/server/repo/projects";

type Context = { params: Promise<{ id: string; levelId: string }> };

const BodySchema = z.object({ regenerate: z.boolean().optional() }).strict();

async function* once(text: string) {
  yield text;
}

/**
 * Streams the Tour mode lesson for one level. A lesson already written for
 * this level is sent again as it was (no model call, not saved twice);
 * `regenerate: true` asks the tutor for a new one.
 */
export async function POST(request: Request, context: Context) {
  const params = await context.params;
  const projectId = parseId(params.id);
  const levelId = parseId(params.levelId);
  if (!projectId || !levelId) return errorResponse(404, "Level was not found.");
  const raw = await request.json().catch(() => ({}));
  const body = BodySchema.safeParse(raw ?? {});
  if (!body.success) return errorResponse(400, "The request body was not valid.");
  try {
    getProject(projectId);
    if (!body.data.regenerate) {
      const saved = savedLesson(getDb(), projectId, levelId);
      if (saved) {
        const response = await streamText(once(saved));
        response.headers.set("X-Retrace-Reused", "1");
        return response;
      }
    }
    checkAiRateLimit(getEnv().AI_RATE_LIMIT_PER_MIN);
    const task = prepareLesson(projectId, levelId);
    return await streamText(task.provider.stream(task.request, request.signal), {
      onComplete: task.save,
    });
  } catch (error) {
    return handleRouteError(error, "lesson.failed");
  }
}
