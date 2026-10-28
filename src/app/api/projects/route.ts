import { handleRouteError } from "@/server/http";
import { listProjects } from "@/server/repo/projects";

export async function GET() {
  try {
    return Response.json({ projects: listProjects() });
  } catch (error) {
    return handleRouteError(error, "projects.list_failed");
  }
}
