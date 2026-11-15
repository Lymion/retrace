import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { type Db, getDb } from "@/db/client";
import { concepts, files, levels, quizAttempts, quizQuestions, quizzes } from "@/db/schema";
import { QuizGenerateSchema, QuizGradeSchema } from "@/shared/contracts";
import type { Layer } from "@/shared/enums";
import { HttpError, notFound } from "../../http";
import { recordLearningEvent } from "../../learner/events";
import { applyResult, conceptId, difficultyRule } from "../../learner/profile";
import { getSettings } from "../../settings";
import { codeBundle } from "../code-bundle";
import { buildTutorRequest } from "../context";
import { runJsonTask } from "../json";
import type { AIProvider } from "../provider";
import { renderPrompt } from "../prompts";
import { modelFor } from "../models";
import { getActiveProvider } from "../registry";

// Quizzes from the learner's own code. The answers never leave the server
// until the learner has answered: the quiz view hides them.

export async function createQuiz(
  projectId: number,
  levelId: number | null,
  db: Db = getDb(),
  provider: AIProvider = getActiveProvider(db),
): Promise<number> {
  const settings = getSettings(db);
  let scope = "the whole project";
  if (levelId !== null) {
    const level = db
      .select()
      .from(levels)
      .where(and(eq(levels.id, levelId), eq(levels.projectId, projectId)))
      .get();
    if (!level) throw notFound("Level");
    if (level.skipped)
      throw new HttpError(409, "This level has no code to quiz you on. Try the whole project.");
    scope = `level ${level.number} (${level.name})`;
  }

  const bundle = codeBundle(db, { projectId, levelId, maxLines: 1200 });
  const request = buildTutorRequest({
    db,
    projectId,
    task: "quiz_generate",
    model: modelFor(settings, "tutor"),
    instructions: renderPrompt("quiz_generate", {
      learner_name: settings.learnerName,
      scope,
      depth: settings.depth,
      difficulty_rule: difficultyRule(db),
      code: bundle.text,
    }),
    levelId,
    messages: [{ role: "user", content: "Write my quiz as JSON." }],
    maxTokens: 4000,
  });
  const output = await runJsonTask({
    provider,
    request,
    schema: QuizGenerateSchema,
    check: (quiz) => {
      const bad = quiz.questions.find((q) => q.options && !q.options.includes(q.correct_answer));
      return bad
        ? `For multiple choice, correct_answer must be exactly one of the options ("${bad.prompt.slice(0, 60)}").`
        : null;
    },
  });

  const layerByPath = new Map(
    db
      .select({ path: files.path, layer: files.layer })
      .from(files)
      .where(eq(files.projectId, projectId))
      .all()
      .map((f) => [f.path, f.layer] as const),
  );

  return db.transaction(() => {
    const quiz = db
      .insert(quizzes)
      .values({ projectId, levelId, depth: settings.depth })
      .returning()
      .get();
    output.questions.forEach((q, idx) => {
      const file = q.file && layerByPath.has(q.file) ? q.file : null;
      const layer: Layer = (file && layerByPath.get(file)) || "other";
      db.insert(quizQuestions)
        .values({
          quizId: quiz.id,
          idx,
          type: q.type,
          prompt: q.prompt,
          code: q.code ?? null,
          filePath: file,
          options: q.options ?? null,
          correctAnswer: q.correct_answer,
          explanation: q.explanation,
          conceptId: conceptId(db, q.concept, layer),
        })
        .run();
    });
    return quiz.id;
  });
}

function questionsOf(db: Db, quizId: number) {
  return db
    .select({ question: quizQuestions, concept: concepts.name, layer: concepts.layer })
    .from(quizQuestions)
    .leftJoin(concepts, eq(concepts.id, quizQuestions.conceptId))
    .where(eq(quizQuestions.quizId, quizId))
    .orderBy(asc(quizQuestions.idx))
    .all();
}

function attemptsFor(db: Db, questionIds: number[]) {
  if (questionIds.length === 0) return new Map<number, typeof quizAttempts.$inferSelect>();
  const rows = db
    .select()
    .from(quizAttempts)
    .where(inArray(quizAttempts.questionId, questionIds))
    .all();
  return new Map(rows.map((r) => [r.questionId, r]));
}

/** The quiz as the learner sees it: answers only for questions already answered. */
export function getQuizView(db: Db, projectId: number, quizId: number) {
  const quiz = db
    .select()
    .from(quizzes)
    .where(and(eq(quizzes.id, quizId), eq(quizzes.projectId, projectId)))
    .get();
  if (!quiz) throw notFound("Quiz");
  const rows = questionsOf(db, quizId);
  const attempts = attemptsFor(
    db,
    rows.map((r) => r.question.id),
  );
  return {
    id: quiz.id,
    levelId: quiz.levelId,
    depth: quiz.depth,
    questions: rows.map(({ question, concept }) => {
      const attempt = attempts.get(question.id);
      return {
        id: question.id,
        idx: question.idx,
        type: question.type,
        prompt: question.prompt,
        code: question.code,
        filePath: question.filePath,
        options: question.options,
        concept,
        result: attempt
          ? {
              response: attempt.response,
              wasCorrect: attempt.wasCorrect,
              feedback: attempt.feedback,
              correctAnswer: question.correctAnswer,
              explanation: question.explanation,
            }
          : null,
      };
    }),
  };
}
export type QuizView = ReturnType<typeof getQuizView>;

export function latestQuizId(db: Db, projectId: number, levelId: number | null): number | null {
  const row = db
    .select({ id: quizzes.id })
    .from(quizzes)
    .where(
      and(
        eq(quizzes.projectId, projectId),
        levelId === null ? undefined : eq(quizzes.levelId, levelId),
      ),
    )
    .orderBy(desc(quizzes.createdAt), desc(quizzes.id))
    .get();
  return row?.id ?? null;
}

export async function answerQuestion(
  projectId: number,
  quizId: number,
  questionId: number,
  response: string,
  db: Db = getDb(),
  provider: AIProvider = getActiveProvider(db),
) {
  getQuizView(db, projectId, quizId); // 404 for someone else's quiz
  const row = questionsOf(db, quizId).find((r) => r.question.id === questionId);
  if (!row) throw notFound("Question");
  const { question } = row;
  const existing = attemptsFor(db, [questionId]).get(questionId);
  if (existing) return getQuizView(db, projectId, quizId); // one answer per question

  let wasCorrect: boolean;
  let feedback: string;
  if (question.options) {
    // Multiple choice is marked here, no AI needed.
    if (!question.options.includes(response)) throw new HttpError(400, "Pick one of the answers.");
    wasCorrect = response === question.correctAnswer;
    feedback = `${wasCorrect ? "Correct!" : "Not quite."} ${question.explanation}`;
  } else {
    const settings = getSettings(db);
    const grade = await runJsonTask({
      provider,
      schema: QuizGradeSchema,
      request: {
        task: "quiz_grade",
        model: modelFor(settings, "fast"),
        system: renderPrompt("system", { learner_name: settings.learnerName }),
        context: renderPrompt("quiz_grade", {
          learner_name: settings.learnerName,
          question: `${question.prompt}${question.code ? `\n\n${question.code}` : ""}\n\nConcept: ${row.concept ?? "unknown"}`,
          model_answer: question.correctAnswer,
          answer: response.replace(/<\/?answer>/gi, ""),
        }),
        messages: [{ role: "user", content: "Grade my answer as JSON." }],
        maxTokens: 800,
      },
    });
    wasCorrect = grade.correct;
    feedback = grade.feedback;
  }

  db.insert(quizAttempts).values({ questionId, response, wasCorrect, feedback }).run();
  if (row.concept) {
    applyResult(db, row.concept, row.layer ?? "other", wasCorrect ? "correct" : "wrong");
  }
  recordLearningEvent(db, {
    projectId,
    kind: "quiz",
    processed: true,
    detail: { quizId, type: question.type, concept: row.concept, correct: wasCorrect },
  });
  return getQuizView(db, projectId, quizId);
}

/** Score summaries for the progress dashboard, newest first. */
export function quizHistory(db: Db = getDb(), limit = 10) {
  const recent = db
    .select()
    .from(quizzes)
    .orderBy(desc(quizzes.createdAt), desc(quizzes.id))
    .limit(limit)
    .all();
  return recent.map((quiz) => {
    const view = getQuizView(db, quiz.projectId, quiz.id);
    const answered = view.questions.filter((q) => q.result);
    return {
      id: quiz.id,
      projectId: quiz.projectId,
      levelId: quiz.levelId,
      createdAt: quiz.createdAt,
      answered: answered.length,
      correct: answered.filter((q) => q.result?.wasCorrect).length,
      total: view.questions.length,
    };
  });
}
