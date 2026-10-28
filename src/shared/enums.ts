// Small closed sets of values used by the database, the API and the UI.
// Keeping them in one place means a new value is added once, everywhere.

export const LAYERS = [
  "frontend",
  "backend",
  "database",
  "security",
  "config",
  "test",
  "other",
] as const;
export type Layer = (typeof LAYERS)[number];

export const PROJECT_SOURCES = ["zip", "github"] as const;
export type ProjectSource = (typeof PROJECT_SOURCES)[number];

export const PROJECT_PROFILES = ["web", "hardware"] as const;
export type ProjectProfile = (typeof PROJECT_PROFILES)[number];

export const PROJECT_STATUSES = ["ingesting", "ready", "failed"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** Where a level's file assignment came from, strongest evidence first. */
export const EVIDENCE = ["git", "deps", "template"] as const;
export type Evidence = (typeof EVIDENCE)[number];

export const LEVEL_STATUSES = ["not_started", "touring", "rebuilt", "done"] as const;
export type LevelStatus = (typeof LEVEL_STATUSES)[number];

export const ANNOTATION_CATEGORIES = ["concept", "security", "pattern", "gotcha"] as const;
export type AnnotationCategory = (typeof ANNOTATION_CATEGORIES)[number];

export const DEPTHS = ["beginner", "intermediate", "advanced"] as const;
export type Depth = (typeof DEPTHS)[number];

export const SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const QUESTION_TYPES = [
  "what_does_this_do",
  "find_the_bug",
  "security",
  "how_would_you_change",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const PROVIDER_IDS = ["api-key", "claude-login"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const MESSAGE_ROLES = ["user", "assistant"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

/** A chat message is either free chat or a Tour lesson the tutor streamed. */
export const MESSAGE_KINDS = ["chat", "lesson"] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export const LEARNING_EVENT_KINDS = ["rebuild_review", "chat", "quiz", "challenge"] as const;
export type LearningEventKind = (typeof LEARNING_EVENT_KINDS)[number];

export const CHECKLIST_SOURCES = ["gap", "lesson"] as const;
export type ChecklistSource = (typeof CHECKLIST_SOURCES)[number];

export const CHALLENGE_STATUSES = ["open", "submitted", "reviewed"] as const;
export type ChallengeStatus = (typeof CHALLENGE_STATUSES)[number];

export const REBUILD_STATUSES = ["spec", "submitted", "reviewed"] as const;
export type RebuildStatus = (typeof REBUILD_STATUSES)[number];
