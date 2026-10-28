import { z } from "zod";
import { LAYERS } from "./enums";

// The analysis JSON stored on each project. It is computed without AI from
// the uploaded files, so it is the same every time for the same upload.

export const DependencySchema = z.object({
  ecosystem: z.enum(["npm", "pip", "go", "cargo", "other"]),
  name: z.string(),
  version: z.string().nullable(),
  dev: z.boolean(),
  manifest: z.string(),
});
export type Dependency = z.infer<typeof DependencySchema>;

export const LanguageStatSchema = z.object({
  name: z.string(),
  files: z.number().int().nonnegative(),
  lines: z.number().int().nonnegative(),
});

export const SkippedStatSchema = z.object({
  reason: z.string(),
  count: z.number().int().nonnegative(),
});

export const ImportEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
});

export const HistorySchema = z.object({
  available: z.boolean(),
  commitCount: z.number().int().nonnegative(),
  /** True when the clone stopped at the commit cap, so early commits are missing. */
  truncated: z.boolean(),
  /** Index of the first commit (oldest = 0) that added each file still in the project. */
  firstSeen: z.record(z.string(), z.number().int().nonnegative()),
});

export const ProjectAnalysisSchema = z.object({
  fileCount: z.number().int().nonnegative(),
  totalLines: z.number().int().nonnegative(),
  languages: z.array(LanguageStatSchema),
  layers: z.record(z.enum(LAYERS), z.number().int().nonnegative()),
  entryPoints: z.array(z.string()),
  dependencies: z.array(DependencySchema),
  imports: z.array(ImportEdgeSchema),
  externalImports: z.array(z.string()),
  /** Files in dependency order: a file comes after everything it imports. */
  buildOrder: z.array(z.string()),
  history: HistorySchema,
  skipped: z.array(SkippedStatSchema),
  redactionCount: z.number().int().nonnegative(),
});
export type ProjectAnalysis = z.infer<typeof ProjectAnalysisSchema>;
