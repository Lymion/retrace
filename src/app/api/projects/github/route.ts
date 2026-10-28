import { handleRouteError, readJson } from "@/server/http";
import { GithubImportSchema } from "@/server/ingest/github";
import { importFromGithub } from "@/server/ingest/github-import";
import { analyzeAfterStore } from "@/server/analysis/analyze";

export async function POST(request: Request) {
  const body = await readJson(request, GithubImportSchema);
  if (!body.ok) return body.response;

  try {
    const projectId = await importFromGithub(body.data.url, {
      afterStore: (repo, token) => analyzeAfterStore({ kind: "github", repo, token }),
    });
    return Response.json({ projectId }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "github_import.failed");
  }
}
