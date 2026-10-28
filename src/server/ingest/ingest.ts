import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { type Db, dataDir, getDb } from "@/db/client";
import { files as filesTable, projects, redactions as redactionsTable } from "@/db/schema";
import type { Layer, ProjectSource } from "@/shared/enums";
import { log } from "../logger";
import { MB, getSettings } from "../settings";
import { looksBinary, type SkipReason } from "./ignore";
import { detectLanguage } from "./language";
import { guessLayer } from "./layer";
import { type Redaction, redactSecrets } from "./redact";
import { type ExtractLimits, extractZip } from "./safe-extract";

// Turns an uploaded zip into a project in the database:
// extract safely -> drop binaries -> redact secrets -> classify -> store.
// The zip and the temp folder are deleted at the end, success or not.

export interface PreparedFile {
  path: string;
  language: string;
  layer: Layer;
  size: number;
  lineCount: number;
  contentHash: string;
  /** Already redacted. */
  content: string;
  redactions: Redaction[];
}

export interface PreparedProject {
  files: PreparedFile[];
  skipped: Partial<Record<SkipReason, number>>;
  gitDir: string | null;
}

/** Bytes -> redacted text plus metadata. Pure, so tests can call it directly. */
export function prepareFile(filePath: string, data: Buffer): PreparedFile | null {
  if (looksBinary(data)) return null;
  const text = data
    .toString("utf8")
    .replace(/^\uFEFF/, "") // byte-order mark
    .replace(/\r\n?/g, "\n"); // one line-ending style, so line numbers match everywhere
  const { content, redactions } = redactSecrets(filePath, text);
  return {
    path: filePath,
    language: detectLanguage(filePath),
    layer: guessLayer(filePath),
    size: Buffer.byteLength(content),
    lineCount: content === "" ? 0 : content.split("\n").length,
    contentHash: createHash("sha256").update(content).digest("hex"),
    content,
    redactions,
  };
}

export function extractLimits(db: Db = getDb()): ExtractLimits {
  const settings = getSettings(db);
  return {
    maxBytes: settings.maxUploadMb * MB,
    maxFiles: settings.maxFiles,
    maxFileBytes: 1 * MB,
  };
}

export function newTempPath(suffix = ""): string {
  const dir = path.join(dataDir(), "tmp");
  mkdirSync(dir, { recursive: true });
  return path.join(dir, `${randomUUID()}${suffix}`);
}

export interface IngestInput {
  zipPath: string;
  name: string;
  source: ProjectSource;
  sourceRef: string;
  /** Runs after files are stored; phase 3 plugs the analysis in here. */
  afterStore?: (projectId: number, prepared: PreparedProject, db: Db) => Promise<void>;
}

export async function ingestZip(input: IngestInput, db: Db = getDb()): Promise<number> {
  const workDir = newTempPath();
  mkdirSync(workDir, { recursive: true });
  const started = Date.now();
  try {
    const extracted = await extractZip(input.zipPath, workDir, extractLimits(db));

    const skipped = { ...extracted.skipped };
    const prepared: PreparedFile[] = [];
    for (const file of extracted.files) {
      const result = prepareFile(file.path, file.data);
      if (result) prepared.push(result);
      else skipped["binary or media"] = (skipped["binary or media"] ?? 0) + 1;
    }
    prepared.sort((a, b) => a.path.localeCompare(b.path));

    const projectId = storeProject(db, input, prepared);
    await input.afterStore?.(projectId, { files: prepared, skipped, gitDir: extracted.gitDir }, db);

    log.info("ingest.done", {
      projectId,
      files: prepared.length,
      redactions: prepared.reduce((sum, f) => sum + f.redactions.length, 0),
      ms: Date.now() - started,
    });
    return projectId;
  } finally {
    rmSync(input.zipPath, { force: true });
    rmSync(workDir, { recursive: true, force: true });
  }
}

function storeProject(db: Db, input: IngestInput, prepared: PreparedFile[]): number {
  return db.transaction((tx) => {
    const project = tx
      .insert(projects)
      .values({
        name: input.name,
        source: input.source,
        sourceRef: input.sourceRef,
        status: "ingesting",
      })
      .returning({ id: projects.id })
      .get();

    for (const file of prepared) {
      const row = tx
        .insert(filesTable)
        .values({
          projectId: project.id,
          path: file.path,
          language: file.language,
          layer: file.layer,
          size: file.size,
          lineCount: file.lineCount,
          contentHash: file.contentHash,
          content: file.content,
        })
        .returning({ id: filesTable.id })
        .get();
      for (const redaction of file.redactions) {
        tx.insert(redactionsTable)
          .values({
            projectId: project.id,
            fileId: row.id,
            line: redaction.line,
            kind: redaction.kind,
          })
          .run();
      }
    }
    return project.id;
  });
}
