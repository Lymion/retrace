import Link from "next/link";
import { and, count, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { learningEvents, levels, projects } from "@/db/schema";
import { EmptyState } from "@/components/states";
import { Pane, PromptLine } from "@/components/terminal";
import { Checklist } from "@/features/progress/Checklist";
import { ConceptMastery } from "@/features/progress/ConceptMastery";
import { formatDate } from "@/lib/format";
import { formatTokens, totalTokens } from "@/lib/tokens";
import { listChecklist } from "@/server/ai/tasks/insights";
import { quizHistory } from "@/server/ai/tasks/quiz";
import { listProfile } from "@/server/learner/profile";
import { cachedPercent, usageSummary } from "@/server/ai/usage";

export const metadata = { title: "Progress · Retrace" };

/** Levels done per project, counting only levels the project actually has (not skipped ones). */
function levelProgress() {
  const db = getDb();
  const projectRows = db.select({ id: projects.id, name: projects.name }).from(projects).all();
  const levelRows = db
    .select({ projectId: levels.projectId, status: levels.status, skipped: levels.skipped })
    .from(levels)
    .all();
  return projectRows
    .map((p) => {
      const own = levelRows.filter((l) => l.projectId === p.id && !l.skipped);
      return {
        ...p,
        total: own.length,
        done: own.filter((l) => l.status === "done").length,
        started: own.filter((l) => l.status !== "not_started").length,
      };
    })
    .filter((p) => p.total > 0);
}

export default function ProgressPage() {
  const db = getDb();
  const concepts = listProfile(db);
  const quizzes = quizHistory(db, 8);
  const projectNames = new Map(
    db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .all()
      .map((p) => [p.id, p.name]),
  );
  const progress = levelProgress();
  const pending =
    db
      .select({ n: count() })
      .from(learningEvents)
      .where(and(eq(learningEvents.kind, "chat"), isNull(learningEvents.processedAt)))
      .get()?.n ?? 0;
  const week = usageSummary(db).week;
  const answered = quizzes.filter((q) => q.answered > 0);
  const quizAverage = answered.length
    ? Math.round((answered.reduce((n, q) => n + q.correct / q.answered, 0) / answered.length) * 100)
    : null;
  const levelsDone = progress.reduce((n, p) => n + p.done, 0);
  const levelsTotal = progress.reduce((n, p) => n + p.total, 0);
  const weak = concepts.filter((c) => c.mastery < 0.4).length;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-7 p-4 sm:p-6">
      <header>
        <PromptLine command="retrace" flags="--stats" />
        <h1 className="mt-1 text-xl font-bold text-bright">Progress</h1>
        <p className="text-sm text-comment">
          <span aria-hidden>{"// "}</span>
          What you have built, what you have mastered, and what to practise next.
        </p>
      </header>

      <Pane title="summary" role="accent">
        <dl className="grid grid-cols-[13ch_minmax(0,1fr)] gap-x-4 gap-y-0.5 tabular-nums sm:grid-cols-[16ch_minmax(0,1fr)]">
          <dt className="text-accent">levels</dt>
          <dd className="text-bright">
            {levelsDone} / {levelsTotal} done
          </dd>
          <dt className="text-keyword">quiz average</dt>
          <dd className="text-bright">
            {quizAverage === null ? "no quizzes yet" : `${quizAverage}%`}
          </dd>
          <dt className="text-cyan">concepts</dt>
          <dd className="text-bright">
            {concepts.length} seen · {weak} weak
          </dd>
          <dt className="text-number">tokens (week)</dt>
          <dd className="text-bright">
            {formatTokens(totalTokens(week))}
            {week.calls > 0 && ` · ${cachedPercent(week)}% from cache`}
          </dd>
        </dl>
      </Pane>

      <section aria-labelledby="levels-progress" className="card c-keyword space-y-3 p-5">
        <h2 id="levels-progress" className="text-lg font-semibold">
          Levels completed
        </h2>
        {progress.length === 0 ? (
          <EmptyState title="No roadmaps yet">
            Upload a project and build its roadmap to start.
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {progress.map((p) => (
              <li key={p.id}>
                <div className="flex justify-between text-sm">
                  <Link href={`/projects/${p.id}`} className="hover:text-accent">
                    {p.name}
                  </Link>
                  <span className="text-muted">
                    {p.done} of {p.total} done · {p.started} started
                  </span>
                </div>
                <div
                  className="term-bar mt-1"
                  role="progressbar"
                  aria-label={`${p.name} levels done`}
                  aria-valuemin={0}
                  aria-valuemax={p.total}
                  aria-valuenow={p.done}
                >
                  <div className="bar-fill" style={{ width: `${(p.done / p.total) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <ConceptMastery concepts={concepts} pendingQuestions={pending} />
        <section aria-labelledby="quiz-history" className="card c-number space-y-3 p-5">
          <h2 id="quiz-history" className="text-lg font-semibold">
            Recent quizzes
          </h2>
          {quizzes.length === 0 ? (
            <EmptyState title="No quizzes yet">
              Open a project in the workspace and switch to Quiz.
            </EmptyState>
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">Recent quiz scores</caption>
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-1 font-normal">Project</th>
                  <th className="py-1 font-normal">Date</th>
                  <th className="py-1 text-right font-normal">Score</th>
                </tr>
              </thead>
              <tbody>
                {quizzes.map((q) => (
                  <tr key={q.id} className="border-t border-border">
                    <td className="py-1.5">
                      <Link
                        href={`/projects/${q.projectId}/workspace?mode=quiz${q.levelId ? `&level=${q.levelId}` : ""}`}
                        className="hover:text-accent"
                      >
                        {projectNames.get(q.projectId) ?? "Project"}
                      </Link>
                    </td>
                    <td className="py-1.5 text-muted">{formatDate(q.createdAt)}</td>
                    <td className="py-1.5 text-right">
                      {q.answered === 0 ? (
                        <span className="text-muted">not started</span>
                      ) : (
                        <>
                          {q.correct}/{q.answered}
                          {q.answered < q.total && (
                            <span className="text-muted"> ({q.total - q.answered} left)</span>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <Checklist items={listChecklist(db)} />
    </div>
  );
}
