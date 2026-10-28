import { and, asc, eq } from "drizzle-orm";
import { type Db, getDb } from "@/db/client";
import { files, levels, messages } from "@/db/schema";
import type { MessageKind } from "@/shared/enums";
import { HttpError, notFound } from "../../http";
import { getSettings } from "../../settings";
import { buildTutorRequest, fileBlock, recentMessages } from "../context";
import type { AIProvider, AIRequest } from "../provider";
import { renderPrompt } from "../prompts";
import { getActiveProvider } from "../registry";
import { collectOutsideContext } from "../../context-providers/registry";

// The two streamed tasks: free chat (including "Explain this selection")
// and teach_level, the Tour mode lesson.

const LESSON_LINE_BUDGET = 1500;

export interface ChatInput {
  projectId: number;
  levelId?: number | null;
  fileId?: number | null;
  message: string;
  selection?: { startLine: number; endLine: number } | null;
}

export interface StreamedTask {
  provider: AIProvider;
  request: AIRequest;
  /** Saves the reply once the stream has finished. */
  save: (reply: string) => void;
}

function saveMessage(
  db: Db,
  values: {
    projectId: number;
    levelId?: number | null;
    fileId?: number | null;
    role: "user" | "assistant";
    kind: MessageKind;
    content: string;
    provider?: AIProvider["id"];
  },
) {
  db.insert(messages)
    .values({ ...values, levelId: values.levelId ?? null, fileId: values.fileId ?? null })
    .run();
}

export function prepareChat(
  input: ChatInput,
  db: Db = getDb(),
  provider: AIProvider = getActiveProvider(db),
): StreamedTask {
  const settings = getSettings(db);
  const file = input.fileId
    ? db
        .select()
        .from(files)
        .where(and(eq(files.id, input.fileId), eq(files.projectId, input.projectId)))
        .get()
    : undefined;
  if (input.fileId && !file) throw notFound("File");

  // History is read before this turn is saved, so the new message is not in it twice.
  const history = recentMessages(db, input.projectId, 10);

  const selectionRule = input.selection
    ? `- The learner selected lines ${input.selection.startLine}-${input.selection.endLine} of the open file and wants them explained. Explain what those lines do and why they are written this way, line by line if short.`
    : "";

  const request = buildTutorRequest({
    db,
    projectId: input.projectId,
    task: input.selection ? "explain_selection" : "chat",
    model: settings.tutorModel,
    instructions: renderPrompt("chat", {
      learner_name: settings.learnerName,
      selection_rule: selectionRule,
    }),
    levelId: input.levelId,
    file: file
      ? {
          path: file.path,
          content: file.content,
          focus: input.selection
            ? { start: input.selection.startLine, end: input.selection.endLine }
            : undefined,
        }
      : null,
    outside: collectOutsideContext({ projectId: input.projectId, fileId: input.fileId ?? null }),
    messages: [...history, { role: "user", content: input.message }],
    maxTokens: 1500,
  });

  return {
    provider,
    request,
    // Both turns are saved together once the reply is complete, so a failed
    // request (and its retry) never leaves a question without an answer.
    save: (reply) => {
      saveMessage(db, { ...input, role: "user", kind: "chat", content: input.message });
      saveMessage(db, {
        projectId: input.projectId,
        levelId: input.levelId,
        fileId: input.fileId,
        role: "assistant",
        kind: "chat",
        content: reply,
        provider: provider.id,
      });
    },
  };
}

/** The level's files as <file> blocks, within a total line budget; the rest as outlines. */
export function levelFilesBlock(db: Db, levelId: number): string {
  const rows = db
    .select()
    .from(files)
    .where(eq(files.levelId, levelId))
    .orderBy(asc(files.path))
    .all();
  if (rows.length === 0) return "(This level has no files in the project.)";
  let used = 0;
  return rows
    .map((file) => {
      if (used + file.lineCount <= LESSON_LINE_BUDGET) {
        used += file.lineCount;
        return fileBlock(file.path, file.content);
      }
      // Over budget: the outline still tells the tutor what is in the file.
      const outline = fileBlock(file.path, file.content, { start: 1, end: 1 });
      used += Math.min(file.lineCount, 200);
      return outline;
    })
    .join("\n\n");
}

export function prepareLesson(
  projectId: number,
  levelId: number,
  db: Db = getDb(),
  provider: AIProvider = getActiveProvider(db),
): StreamedTask {
  const settings = getSettings(db);
  const level = db
    .select()
    .from(levels)
    .where(and(eq(levels.id, levelId), eq(levels.projectId, projectId)))
    .get();
  if (!level) throw notFound("Level");
  if (!level.goal) throw new HttpError(409, "Build the roadmap first.");

  const history = recentMessages(db, projectId, 10);
  const request = buildTutorRequest({
    db,
    projectId,
    task: "teach_level",
    model: settings.tutorModel,
    instructions: renderPrompt("teach_level", {
      learner_name: settings.learnerName,
      level_label: `${level.number}: ${level.name}`,
      depth: settings.depth,
      skipped_rule: level.skipped
        ? "This project SKIPPED this level, so there are no files. Teach it as a missing level: what it would add to this project, which files you would create and where, and what could go wrong without it. In part 2, list the files the learner would write (marked as new)."
        : "",
      level_files: levelFilesBlock(db, levelId),
    }),
    levelId,
    outside: collectOutsideContext({ projectId, fileId: null }),
    messages: [
      ...history,
      { role: "user", content: `Teach me level ${level.number}: ${level.name}.` },
    ],
    maxTokens: 3500,
  });

  if (level.status === "not_started") {
    db.update(levels).set({ status: "touring" }).where(eq(levels.id, levelId)).run();
  }

  return {
    provider,
    request,
    save: (reply) =>
      saveMessage(db, {
        projectId,
        levelId,
        role: "assistant",
        kind: "lesson",
        content: reply,
        provider: provider.id,
      }),
  };
}
