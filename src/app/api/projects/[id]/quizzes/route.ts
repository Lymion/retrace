import { z } from "zod";
import { getDb } from "@/db/client";
import { createQuiz, getQuizView, latestQuizId } from "@/server/ai/tasks/quiz";
import { getEnv } from "@/server/env";
import { errorResponse, handleRouteError, parseId, readJson } from "@/server/http";
import { checkAiRateLimit } from "@/server/rate-limit";
import { getProject } from "@/server/repo/projects";

type Context = { params: Promise<{ id: string }> };

/** The latest quiz for a level (?levelId=) or the project, answers hidden until answered. */
export async function GET(request: Request, context: Context) {
  const projectId = parseId((await context.params).id);
  if (!projectId) return errorResponse(404, "Project was not found.");
  const levelId = parseId(new URL(request.url).searchParams.get("levelId") ?? undefined);
  try {
    getProject(projectId);
    const db = getDb();
    const quizId = latestQuizId(db, projectId, levelId);
    return Response.json({ quiz: quizId ? getQuizView(db, projectId, quizId) : null });
  } catch (error) {
    return handleRouteError(error, "quiz.get_failed");
  }
}

const CreateSchema = z.object({ levelId: z.number().int().positive().nullable() }).strict();

export async function POST(request: Request, context: Context) {
  const projectId = parseId((await context.params).id);
  if (!projectId) return errorResponse(404, "Project was not found.");
  const body = await readJson(request, CreateSchema);
  if (!body.ok) return body.response;
  try {
    getProject(projectId);
    checkAiRateLimit(getEnv().AI_RATE_LIMIT_PER_MIN);
    const quizId = await createQuiz(projectId, body.data.levelId);
    return Response.json({ quiz: getQuizView(getDb(), projectId, quizId) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "quiz.create_failed");
  }
}
