"use client";

import Link from "next/link";
import { useState } from "react";
import { EmptyState, ErrorState, LoadingState, Spinner } from "@/components/states";
import { ProviderErrorActions } from "@/features/settings/ProviderErrorActions";
import { errorMessage, postJson } from "@/lib/api-client";
import { useFetch } from "@/lib/use-fetch";

// One question at a time. The server only sends the answer and explanation
// for questions the learner has already answered.

interface Question {
  id: number;
  idx: number;
  type: "what_does_this_do" | "find_the_bug" | "security" | "how_would_you_change";
  prompt: string;
  code: string | null;
  filePath: string | null;
  options: string[] | null;
  concept: string | null;
  result: {
    response: string;
    wasCorrect: boolean;
    feedback: string;
    correctAnswer: string;
    explanation: string;
  } | null;
}

interface Quiz {
  id: number;
  questions: Question[];
}

const TYPE_LABEL: Record<Question["type"], string> = {
  what_does_this_do: "What does this do?",
  find_the_bug: "Find the bug",
  security: "Security",
  how_would_you_change: "How would you change it?",
};

export function QuizPanel({
  projectId,
  levelId,
  scopeLabel,
}: {
  projectId: number;
  levelId: number | null;
  scopeLabel: string;
}) {
  const url = `/api/projects/${projectId}/quizzes${levelId ? `?levelId=${levelId}` : ""}`;
  const latest = useFetch<{ quiz: Quiz | null }>(url);
  const [local, setLocal] = useState<{ url: string; quiz: Quiz } | null>(null);
  const quiz = local?.url === url ? local.quiz : (latest.data?.quiz ?? null);
  const [index, setIndex] = useState<{ quizId: number; i: number } | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState<"new" | "answer" | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Start at the first unanswered question.
  const firstOpen = quiz
    ? Math.max(
        0,
        quiz.questions.findIndex((q) => !q.result),
      )
    : 0;
  const current = quiz && index?.quizId === quiz.id ? index.i : firstOpen;
  const question = quiz?.questions[current] ?? null;
  const allDone = quiz?.questions.every((q) => q.result) ?? false;
  const score = quiz?.questions.filter((q) => q.result?.wasCorrect).length ?? 0;

  async function act<T>(kind: "new" | "answer", task: () => Promise<T>, then: (value: T) => void) {
    setBusy(kind);
    setError(null);
    try {
      then(await task());
    } catch (err) {
      setError(err instanceof Error ? err : new Error(errorMessage(err)));
    } finally {
      setBusy(null);
    }
  }

  const newQuiz = () =>
    act(
      "new",
      () => postJson<{ quiz: Quiz }>(`/api/projects/${projectId}/quizzes`, { levelId }),
      ({ quiz: created }) => {
        setLocal({ url, quiz: created });
        setIndex({ quizId: created.id, i: 0 });
        setAnswer("");
      },
    );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!quiz || !question || !answer.trim()) return;
    void act(
      "answer",
      () =>
        postJson<{ quiz: Quiz }>(`/api/projects/${projectId}/quizzes/${quiz.id}/answer`, {
          questionId: question.id,
          response: answer,
        }),
      ({ quiz: updated }) => {
        setLocal({ url, quiz: updated });
        // Stay on this question so the learner sees the result before moving on.
        setIndex({ quizId: updated.id, i: current });
      },
    );
  };

  const go = (i: number) => {
    if (!quiz) return;
    setIndex({ quizId: quiz.id, i });
    setAnswer("");
  };

  const errorBox = error && (
    <ErrorState message={error.message}>
      <ProviderErrorActions error={error} />
    </ErrorState>
  );

  return (
    <section aria-label={`Quiz on ${scopeLabel}`} className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto font-semibold">Quiz · {scopeLabel}</h2>
        <Link href={`/projects/${projectId}/challenge`} className="btn btn-ghost text-accent">
          Remix challenge →
        </Link>
        <button type="button" className="btn" onClick={newQuiz} disabled={busy !== null}>
          {quiz ? "New quiz" : "Start a quiz"}
        </button>
      </div>

      {latest.loading && <LoadingState label="Loading your quiz…" />}
      {latest.error && <ErrorState message={latest.error} onRetry={latest.reload} />}
      {busy === "new" && <Spinner label="Writing five questions from your code…" />}
      {errorBox}

      {!latest.loading && !quiz && busy !== "new" && (
        <EmptyState title="No quiz yet">
          Five questions written from this code: two on what it does, one bug hunt, one security
          question and one on how you would change it. Answers stay hidden until you answer.
        </EmptyState>
      )}

      {quiz && question && (
        <div className="card space-y-3 p-4">
          <div className="flex items-center gap-2 text-xs text-muted">
            <span>
              Question {current + 1} of {quiz.questions.length}
            </span>
            <span className="chip">{TYPE_LABEL[question.type]}</span>
            {question.concept && <span className="chip">{question.concept}</span>}
            <span className="ml-auto">
              Score {score}/{quiz.questions.filter((q) => q.result).length}
            </span>
          </div>
          <p className="font-medium">{question.prompt}</p>
          {question.code && (
            <figure>
              {question.filePath && (
                <figcaption className="mb-1 font-mono text-xs text-muted">
                  {question.filePath}
                </figcaption>
              )}
              <pre className="overflow-x-auto rounded border border-border bg-bg p-3 font-mono text-xs">
                {question.code}
              </pre>
            </figure>
          )}

          {!question.result ? (
            <form onSubmit={submit} className="space-y-3">
              {question.options ? (
                <fieldset className="space-y-2">
                  <legend className="sr-only">Choose an answer</legend>
                  {question.options.map((option) => (
                    <label
                      key={option}
                      className="flex cursor-pointer items-start gap-2 rounded border border-border p-2 hover:border-accent"
                    >
                      <input
                        type="radio"
                        name={`q${question.id}`}
                        className="mt-1"
                        checked={answer === option}
                        onChange={() => setAnswer(option)}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </fieldset>
              ) : (
                <>
                  <label htmlFor={`answer-${question.id}`} className="sr-only">
                    Your answer
                  </label>
                  <textarea
                    id={`answer-${question.id}`}
                    className="input min-h-28"
                    placeholder="Your answer, in English, Malay or both"
                    value={answer}
                    maxLength={4000}
                    onChange={(e) => setAnswer(e.target.value)}
                  />
                </>
              )}
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy !== null || !answer.trim()}
              >
                {busy === "answer" ? "Checking…" : "Submit answer"}
              </button>
            </form>
          ) : (
            <div className="space-y-2" aria-live="polite">
              <p className={question.result.wasCorrect ? "text-ok" : "text-danger"}>
                {question.result.wasCorrect ? "✓ Correct" : "✗ Not quite"}
              </p>
              <p className="text-sm">
                <span className="text-muted">You answered:</span> {question.result.response}
              </p>
              <p className="text-sm">{question.result.feedback}</p>
              <p className="text-sm">
                <span className="text-muted">Answer:</span> {question.result.correctAnswer}
              </p>
              <p className="text-sm text-muted">{question.result.explanation}</p>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              className="btn"
              onClick={() => go(current - 1)}
              disabled={current === 0}
            >
              ← Previous
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => go(current + 1)}
              disabled={current >= quiz.questions.length - 1}
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {quiz && allDone && (
        <p className="text-sm" aria-live="polite">
          Done: {score} of {quiz.questions.length} correct. Your profile has been updated, so the
          next quiz leans on what you missed.
        </p>
      )}
    </section>
  );
}
