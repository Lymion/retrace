import { and, asc, count, desc, eq } from "drizzle-orm";
import { type Db, getDb } from "@/db/client";
import { files, levels, projects, redactions } from "@/db/schema";
import { notFound } from "../http";

// Read queries for projects and their files. File content is only loaded
// by getFileContent, so lists stay small.

export function listProjects(db: Db = getDb()) {
  const fileCounts = db
    .select({ projectId: files.projectId, fileCount: count(files.id).as("fileCount") })
    .from(files)
    .groupBy(files.projectId)
    .as("fc");
  return db
    .select({
      id: projects.id,
      name: projects.name,
      source: projects.source,
      sourceRef: projects.sourceRef,
      status: projects.status,
      error: projects.error,
      createdAt: projects.createdAt,
      fileCount: fileCounts.fileCount,
    })
    .from(projects)
    .leftJoin(fileCounts, eq(fileCounts.projectId, projects.id))
    .orderBy(desc(projects.createdAt))
    .all();
}
export type ProjectListItem = ReturnType<typeof listProjects>[number];

export function getProject(projectId: number, db: Db = getDb()) {
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) throw notFound("Project");
  return project;
}

export function listFiles(projectId: number, db: Db = getDb()) {
  return db
    .select({
      id: files.id,
      path: files.path,
      language: files.language,
      layer: files.layer,
      levelId: files.levelId,
      size: files.size,
      lineCount: files.lineCount,
      isEntry: files.isEntry,
    })
    .from(files)
    .where(eq(files.projectId, projectId))
    .orderBy(asc(files.path))
    .all();
}
export type FileMeta = ReturnType<typeof listFiles>[number];

export function getFileContent(projectId: number, fileId: number, db: Db = getDb()) {
  const file = db
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.projectId, projectId)))
    .get();
  if (!file) throw notFound("File");
  return file;
}

export function listRedactions(projectId: number, db: Db = getDb()) {
  return db
    .select({
      id: redactions.id,
      path: files.path,
      fileId: files.id,
      line: redactions.line,
      kind: redactions.kind,
    })
    .from(redactions)
    .innerJoin(files, eq(files.id, redactions.fileId))
    .where(eq(redactions.projectId, projectId))
    .orderBy(asc(files.path), asc(redactions.line))
    .all();
}
export type RedactionItem = ReturnType<typeof listRedactions>[number];

export function listLevels(projectId: number, db: Db = getDb()) {
  return db
    .select()
    .from(levels)
    .where(eq(levels.projectId, projectId))
    .orderBy(asc(levels.number))
    .all();
}
export type LevelRow = ReturnType<typeof listLevels>[number];

export function deleteProject(projectId: number, db: Db = getDb()): void {
  getProject(projectId, db);
  db.delete(projects).where(eq(projects.id, projectId)).run();
}
