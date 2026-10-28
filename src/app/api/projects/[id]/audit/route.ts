import { z } from "zod";
import { getDb } from "@/db/client";
import { listFindings, runAudit } from "@/server/ai/tasks/audit";
import { getEnv } from "@/server/env";
import { errorResponse, handleRouteError, parseId, readJson } from "@/server/http";
import { checkAiRateLimit } from "@/server/rate-limit";
import { getProject } from "@/server/repo/projects";

type Context = { params: Promise<{ id: string }> };

/** Findings for one level (?levelId=) or the whole project (no levelId). */
export async function GET(request: Request, context: Context) {
  const projectId = parseId((await context.params).id);
  if (!projectId) return errorResponse(404, "Project was not found.");
  const levelId = parseId(new URL(request.url).searchParams.get("levelId") ?? undefined);
  try {
    getProject(projectId);
    return Response.json({ findings: listFindings(getDb(), projectId, levelId) });
  } catch (error) {
    return handleRouteError(error, "audit.list_failed");
  }
}

const RunSchema = z.object({ levelId: z.number().int().positive().nullable() }).strict();

export async function POST(request: Request, context: Context) {
  const projectId = parseId((await context.params).id);
  if (!projectId) return errorResponse(404, "Project was not found.");
  const body = await readJson(request, RunSchema);
  if (!body.ok) return body.response;
  try {
    checkAiRateLimit(getEnv().AI_RATE_LIMIT_PER_MIN);
    return Response.json({ findings: await runAudit(projectId, body.data.levelId) });
  } catch (error) {
    return handleRouteError(error, "audit.run_failed");
  }
}
