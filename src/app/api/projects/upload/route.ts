import { z } from "zod";
import { errorResponse, handleRouteError } from "@/server/http";
import { streamToFile } from "@/server/ingest/github";
import { extractLimits, ingestZip, newTempPath } from "@/server/ingest/ingest";
import { analyzeAfterStore } from "@/server/analysis/analyze";

// The browser sends the zip as the raw request body (not multipart), so we
// can count bytes as they arrive and stop at the limit instead of buffering
// the whole upload first.

const FileNameSchema = z
  .string()
  .max(255)
  .transform((value) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  })
  .transform((value) => value.split(/[\\/]/).pop() ?? "")
  .refine((value) => /\.zip$/i.test(value), { message: "Only .zip files can be uploaded." });

export async function POST(request: Request) {
  const name = FileNameSchema.safeParse(request.headers.get("x-filename") ?? "");
  if (!name.success)
    return errorResponse(400, name.error.issues[0]?.message ?? "Only .zip files can be uploaded.");

  const { maxBytes } = extractLimits();
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    return errorResponse(
      413,
      `The zip is larger than the ${maxBytes / 1024 / 1024} MB limit.`,
      "too_large",
    );
  }
  if (!request.body) return errorResponse(400, "The upload was empty.");

  try {
    const zipPath = newTempPath(".zip");
    await streamToFile(request.body, zipPath, maxBytes);
    const projectId = await ingestZip({
      zipPath,
      name: name.data.replace(/\.zip$/i, ""),
      source: "zip",
      sourceRef: name.data,
      afterStore: analyzeAfterStore({ kind: "zip" }),
    });
    return Response.json({ projectId }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "upload.failed");
  }
}
