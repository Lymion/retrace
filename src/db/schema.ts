import {
  type AnySQLiteColumn,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { ProjectAnalysis } from "@/shared/analysis";
import {
  ANNOTATION_CATEGORIES,
  CHALLENGE_STATUSES,
  CHECKLIST_SOURCES,
  DEPTHS,
  EVIDENCE,
  LAYERS,
  LEARNING_EVENT_KINDS,
  LEVEL_STATUSES,
  MESSAGE_KINDS,
  MESSAGE_ROLES,
  PROJECT_PROFILES,
  PROJECT_SOURCES,
  PROJECT_STATUSES,
  PROVIDER_IDS,
  QUESTION_TYPES,
  REBUILD_STATUSES,
  SEVERITIES,
} from "@/shared/enums";

// The whole schema, Tier 2 included, lives here from day one so later
// features add rows, not new shapes. JSON columns are typed `unknown` where
// the content comes from the model: it is always parsed with Zod on read.

const id = () => integer().primaryKey({ autoIncrement: true });
const createdAt = () =>
  integer({ mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

// ---------------------------------------------------------------- projects

export const projects = sqliteTable("project", {
  id: id(),
  name: text().notNull(),
  source: text({ enum: PROJECT_SOURCES }).notNull(),
  /** Original zip name, or "owner/repo@ref" for GitHub. */
  sourceRef: text().notNull(),
  profile: text({ enum: PROJECT_PROFILES }).notNull().default("web"),
  status: text({ enum: PROJECT_STATUSES }).notNull().default("ingesting"),
  /** Friendly error shown when status is "failed". */
  error: text(),
  /** AI-written overview paragraph (markdown). Null until the roadmap runs. */
  summary: text(),
  analysis: text({ mode: "json" }).$type<ProjectAnalysis>(),
  historySource: text({ enum: ["git", "none"] })
    .notNull()
    .default("none"),
  createdAt: createdAt(),
});

export const files = sqliteTable(
  "file",
  {
    id: id(),
    projectId: integer()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    path: text().notNull(),
    language: text().notNull(),
    layer: text({ enum: LAYERS }).notNull(),
    levelId: integer().references((): AnySQLiteColumn => levels.id, { onDelete: "set null" }),
    size: integer().notNull(),
    lineCount: integer().notNull(),
    contentHash: text().notNull(),
    /** Always the redacted text. The original never reaches the database. */
    content: text().notNull(),
    isEntry: integer({ mode: "boolean" }).notNull().default(false),
  },
  (t) => [
    uniqueIndex("file_project_path").on(t.projectId, t.path),
    index("file_level").on(t.levelId),
  ],
);

/** What was removed from a file, without the secret itself. */
export const redactions = sqliteTable(
  "redaction",
  {
    id: id(),
    projectId: integer()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    fileId: integer()
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    line: integer().notNull(),
    kind: text().notNull(),
  },
  (t) => [index("redaction_project").on(t.projectId)],
);

export const fileImports = sqliteTable(
  "file_import",
  {
    id: id(),
    projectId: integer()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    fromFileId: integer()
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    /** Null when the import points to a package outside the project. */
    toFileId: integer().references(() => files.id, { onDelete: "cascade" }),
    specifier: text().notNull(),
  },
  (t) => [index("file_import_from").on(t.fromFileId), index("file_import_to").on(t.toFileId)],
);

/** Commit order, dates and changed paths only: no messages, no authors. */
export const gitCommits = sqliteTable(
  "git_commit",
  {
    id: id(),
    projectId: integer()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** 0 is the oldest commit we read. */
    idx: integer().notNull(),
    date: integer({ mode: "timestamp_ms" }).notNull(),
    changedPaths: text({ mode: "json" }).$type<string[]>().notNull(),
  },
  (t) => [index("git_commit_project").on(t.projectId, t.idx)],
);

// ---------------------------------------------------------------- levels

export const levels = sqliteTable(
  "level",
  {
    id: id(),
    projectId: integer()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer().notNull(),
    name: text().notNull(),
    goal: text().notNull(),
    checkpoint: text().notNull(),
    whyThisOrder: text().notNull(),
    evidence: text({ enum: EVIDENCE }).notNull(),
    skipped: integer({ mode: "boolean" }).notNull().default(false),
    status: text({ enum: LEVEL_STATUSES }).notNull().default("not_started"),
    completedAt: integer({ mode: "timestamp_ms" }),
  },
  (t) => [uniqueIndex("level_project_number").on(t.projectId, t.number)],
);

export const annotations = sqliteTable(
  "annotation",
  {
    id: id(),
    fileId: integer()
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    startLine: integer().notNull(),
    endLine: integer().notNull(),
    note: text().notNull(),
    category: text({ enum: ANNOTATION_CATEGORIES }).notNull(),
    depth: text({ enum: DEPTHS }).notNull(),
  },
  (t) => [index("annotation_file_depth").on(t.fileId, t.depth)],
);

export const messages = sqliteTable(
  "message",
  {
    id: id(),
    projectId: integer()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    levelId: integer().references(() => levels.id, { onDelete: "set null" }),
    fileId: integer().references(() => files.id, { onDelete: "set null" }),
    role: text({ enum: MESSAGE_ROLES }).notNull(),
    kind: text({ enum: MESSAGE_KINDS }).notNull().default("chat"),
    content: text().notNull(),
    /** Which provider wrote an assistant message. */
    provider: text({ enum: PROVIDER_IDS }),
    createdAt: createdAt(),
  },
  (t) => [index("message_project").on(t.projectId, t.createdAt)],
);

export const rebuildAttempts = sqliteTable(
  "rebuild_attempt",
  {
    id: id(),
    projectId: integer()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    levelId: integer()
      .notNull()
      .references(() => levels.id, { onDelete: "cascade" }),
    spec: text({ mode: "json" }).$type<unknown>().notNull(),
    /** [{ path, content }] written by the learner. */
    submittedFiles: text({ mode: "json" }).$type<unknown>(),
    review: text({ mode: "json" }).$type<unknown>(),
    status: text({ enum: REBUILD_STATUSES }).notNull().default("spec"),
    createdAt: createdAt(),
  },
  (t) => [index("rebuild_level").on(t.levelId)],
);

// ---------------------------------------------------------------- learner

export const concepts = sqliteTable("concept", {
  id: id(),
  /** Lower-case, trimmed, so "JWT" and "jwt " are the same concept. */
  name: text().notNull().unique(),
  layer: text({ enum: LAYERS }).notNull().default("other"),
});

export const learnerConcepts = sqliteTable("learner_concept", {
  conceptId: integer()
    .primaryKey()
    .references(() => concepts.id, { onDelete: "cascade" }),
  /** 0 = never seen or always wrong, 1 = solid. */
  mastery: real().notNull().default(0),
  hits: integer().notNull().default(0),
  misses: integer().notNull().default(0),
  note: text(),
  lastSeenAt: integer({ mode: "timestamp_ms" }),
});

/** Raw signals that the profile_update task turns into mastery changes. */
export const learningEvents = sqliteTable(
  "learning_event",
  {
    id: id(),
    projectId: integer().references(() => projects.id, { onDelete: "set null" }),
    kind: text({ enum: LEARNING_EVENT_KINDS }).notNull(),
    detail: text({ mode: "json" }).$type<unknown>().notNull(),
    processedAt: integer({ mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("learning_event_pending").on(t.processedAt)],
);

// ---------------------------------------------------------------- quizzes

export const quizzes = sqliteTable("quiz", {
  id: id(),
  projectId: integer()
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  levelId: integer().references(() => levels.id, { onDelete: "set null" }),
  depth: text({ enum: DEPTHS }).notNull(),
  createdAt: createdAt(),
});

export const quizQuestions = sqliteTable(
  "quiz_question",
  {
    id: id(),
    quizId: integer()
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    idx: integer().notNull(),
    type: text({ enum: QUESTION_TYPES }).notNull(),
    prompt: text().notNull(),
    /** Optional code excerpt from the learner's project that the question is about. */
    code: text(),
    filePath: text(),
    options: text({ mode: "json" }).$type<string[] | null>(),
    correctAnswer: text().notNull(),
    explanation: text().notNull(),
    conceptId: integer().references(() => concepts.id, { onDelete: "set null" }),
  },
  (t) => [index("quiz_question_quiz").on(t.quizId, t.idx)],
);

export const quizAttempts = sqliteTable(
  "quiz_attempt",
  {
    id: id(),
    questionId: integer()
      .notNull()
      .references(() => quizQuestions.id, { onDelete: "cascade" }),
    response: text().notNull(),
    wasCorrect: integer({ mode: "boolean" }).notNull(),
    feedback: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("quiz_attempt_question").on(t.questionId)],
);

// ---------------------------------------------------------------- tier 2

export const findings = sqliteTable(
  "finding",
  {
    id: id(),
    projectId: integer()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Null for a project-wide audit. */
    levelId: integer().references(() => levels.id, { onDelete: "set null" }),
    fileId: integer().references(() => files.id, { onDelete: "set null" }),
    line: integer(),
    severity: text({ enum: SEVERITIES }).notNull(),
    title: text().notNull(),
    attackerView: text().notNull(),
    fix: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("finding_project").on(t.projectId, t.levelId)],
);

export const alternatives = sqliteTable(
  "alternative",
  {
    id: id(),
    projectId: integer()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    decision: text().notNull(),
    chosen: text().notNull(),
    /** [{ name, pros[], cons[], pickWhen }] including the chosen option. */
    options: text({ mode: "json" }).$type<unknown>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("alternative_project").on(t.projectId)],
);

/** The learner's reusable "starting a new app" checklist, shared across projects. */
export const checklistItems = sqliteTable("checklist_item", {
  id: id(),
  projectId: integer().references(() => projects.id, { onDelete: "set null" }),
  title: text().notNull().unique(),
  whyItMatters: text().notNull(),
  source: text({ enum: CHECKLIST_SOURCES }).notNull(),
  done: integer({ mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
});

export const challenges = sqliteTable(
  "challenge",
  {
    id: id(),
    projectId: integer()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text().notNull(),
    spec: text({ mode: "json" }).$type<unknown>().notNull(),
    /** [{ path, content }] starter files with TODOs. */
    skeleton: text({ mode: "json" }).$type<unknown>().notNull(),
    hints: text({ mode: "json" }).$type<string[]>().notNull(),
    hintsUsed: integer().notNull().default(0),
    status: text({ enum: CHALLENGE_STATUSES }).notNull().default("open"),
    attempt: text({ mode: "json" }).$type<unknown>(),
    review: text({ mode: "json" }).$type<unknown>(),
    createdAt: createdAt(),
  },
  (t) => [index("challenge_project").on(t.projectId)],
);

// ---------------------------------------------------------------- settings

/** Key/value settings. Values are JSON and validated by src/server/settings.ts. */
export const settings = sqliteTable("setting", {
  key: text().primaryKey(),
  value: text({ mode: "json" }).$type<unknown>().notNull(),
});
