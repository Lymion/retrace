import { z } from "zod";
import { prepareChat } from "@/server/ai/tasks/tutor";
import { streamText } from "@/server/ai/stream";
import { getEnv } from "@/server/env";
import { handleRouteError, readJson } from "@/server/http";
import { checkAiRateLimit } from "@/server/rate-limit";
import { getProject } from "@/server/repo/projects";

const ChatSchema = z
  .object({
    projectId: z.number().int().positive(),
    levelId: z.number().int().positive().nullable().optional(),
    fileId: z.number().int().positive().nullable().optional(),
    message: z
      .string()
      .trim()
      .min(1, "Type a message first.")
      .max(4000, "Keep messages under 4,000 characters."),
    selection: z
      .object({ startLine: z.number().int().min(1), endLine: z.number().int().min(1) })
      .refine((s) => s.endLine >= s.startLine, "The selection ends before it starts.")
      .nullable()
      .optional(),
  })
  .strict();

/** Streams the tutor's reply as plain text. */
export async function POST(request: Request) {
  const body = await readJson(request, ChatSchema);
  if (!body.ok) return body.response;
  try {
    getProject(body.data.projectId);
    checkAiRateLimit(getEnv().AI_RATE_LIMIT_PER_MIN);
    const task = prepareChat(body.data);
    return await streamText(task.provider.stream(task.request, request.signal), {
      onComplete: task.save,
    });
  } catch (error) {
    return handleRouteError(error, "chat.failed");
  }
}
