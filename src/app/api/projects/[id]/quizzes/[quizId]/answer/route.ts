import { z } from "zod";
import { answerQuestion } from "@/server/ai/tasks/quiz";
import { getEnv } from "@/server/env";
import { errorResponse, handleRouteError, parseId, readJson } from "@/server/http";
import { checkAiRateLimit } from "@/server/rate-limit";

type Context = { params: Promise<{ id: string; quizId: string }> };

const AnswerSchema = z
  .object({
    questionId: z.number().int().positive(),
    response: z.string().trim().min(1, "Write an answer first.").max(4000),
  })
  .strict();

/** Grades one answer and only then reveals the correct answer and explanation. */
export async function POST(request: Request, context: Context) {
  const params = await context.params;
  const projectId = parseId(params.id);
  const quizId = parseId(params.quizId);
  if (!projectId || !quizId) return errorResponse(404, "Quiz was not found.");
  const body = await readJson(request, AnswerSchema);
  if (!body.ok) return body.response;
  try {
    checkAiRateLimit(getEnv().AI_RATE_LIMIT_PER_MIN);
    return Response.json({
      quiz: await answerQuestion(projectId, quizId, body.data.questionId, body.data.response),
    });
  } catch (error) {
    return handleRouteError(error, "quiz.answer_failed");
  }
}
