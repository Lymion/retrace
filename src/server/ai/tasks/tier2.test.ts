import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setDbForTests, type Db } from "@/db/client";
import { createTestDb } from "@tests/helpers/db";
import { FakeProvider, fixture } from "@tests/helpers/fake-provider";
import { buildTodoZip } from "@tests/helpers/sample-zips";
import { writeTempZip } from "@tests/helpers/zips";
import { analyzeAfterStore } from "../../analysis/analyze";
import { HttpError } from "../../http";
import { ingestZip } from "../../ingest/ingest";
import { listProfile } from "../../learner/profile";
import { listLevels } from "../../repo/projects";
import { listFindings, runAudit } from "./audit";
import {
  generateAlternatives,
  generateGaps,
  getGapsReport,
  listChecklist,
  setChecklistDone,
} from "./insights";
import { answerQuestion, createQuiz, getQuizView, quizHistory } from "./quiz";
import { createChallenge, revealHint, reviewChallenge } from "./remix";
import { generateRoadmap } from "./roadmap";

let db: Db;
let projectId: number;

beforeEach(async () => {
  db = createTestDb();
  projectId = await ingestZip(
    {
      zipPath: writeTempZip(await buildTodoZip()),
      name: "todo",
      source: "zip",
      sourceRef: "todo.zip",
      afterStore: analyzeAfterStore({ kind: "zip" }),
    },
    db,
  );
  await generateRoadmap(projectId, db, new FakeProvider("api-key", [fixture("roadmap-todo.json")]));
});
afterEach(() => setDbForTests(undefined));

const level = (name: string) => listLevels(projectId, db).find((l) => l.name === name)!;

describe("security_audit", () => {
  it("stores real findings, worst first, and drops invented files and lines", async () => {
    const provider = new FakeProvider("api-key", [fixture("audit-todo.json")]);
    const findings = await runAudit(projectId, null, db, provider);

    expect(findings.map((f) => f.path)).not.toContain("server/routes/users.js");
    expect(findings[0]).toMatchObject({
      severity: "critical",
      path: "server/routes/todos.js",
      line: 16,
    });
    expect(findings.find((f) => f.title === "No rate limit on login")?.line).toBeNull(); // line 400 does not exist
    expect(findings.every((f) => f.attackerView && f.fix)).toBe(true);
    expect(provider.requests[0]!.context).toContain('<file path="server/middleware/auth.js"');
  });

  it("keeps level and project audits apart, and replaces a scope on re-run", async () => {
    const backend = level("Backend core").id;
    await runAudit(projectId, null, db, new FakeProvider("api-key", [fixture("audit-todo.json")]));
    await runAudit(
      projectId,
      backend,
      db,
      new FakeProvider("api-key", [fixture("audit-todo.json")]),
    );
    // Only files in the level count for a level audit.
    expect(
      listFindings(db, projectId, backend)
        .map((f) => f.path)
        .sort(),
    ).toEqual(["server/app.js", "server/routes/todos.js"]);
    await runAudit(projectId, null, db, new FakeProvider("api-key", ['{"findings":[]}']));
    expect(listFindings(db, projectId, null)).toEqual([]);
    expect(listFindings(db, projectId, backend)).toHaveLength(2);
  });
});

describe("alternatives and gaps", () => {
  it("stores each decision with the chosen option and two alternatives", async () => {
    const decisions = await generateAlternatives(
      projectId,
      db,
      new FakeProvider("api-key", [fixture("alternatives-todo.json")]),
    );
    expect(decisions).toHaveLength(3);
    expect(decisions[0]!.options.map((o) => [o.name, o.chosen])).toEqual([
      ["SQLite with better-sqlite3", true],
      ["PostgreSQL", false],
      ["MongoDB", false],
    ]);
    expect(decisions[0]!.options[1]!.pickWhen).toMatch(/Many users/);
  });

  it("saves the report and grows the checklist without duplicates", async () => {
    await generateGaps(projectId, db, new FakeProvider("api-key", [fixture("gaps-todo.json")]));
    const report = getGapsReport(db, projectId)!;
    expect(report.missing.map((m) => m.practice)).toContain("Tests");
    expect(listChecklist(db).map((i) => i.title)).toEqual([
      "Keep secrets in .env, never in code",
      "Add a test for every API route",
      "Hash passwords with bcrypt or argon2",
    ]);
    // A second project's run adds nothing already there.
    await generateGaps(projectId, db, new FakeProvider("api-key", [fixture("gaps-todo.json")]));
    expect(listChecklist(db)).toHaveLength(3);

    const first = listChecklist(db)[0]!;
    setChecklistDone(first.id, true, db);
    expect(listChecklist(db).at(-1)!.done).toBe(true); // done items sink to the bottom
  });
});

describe("quizzes", () => {
  it("hides answers until the learner answers, then reveals them", async () => {
    const quizId = await createQuiz(
      projectId,
      level("Backend core").id,
      db,
      new FakeProvider("api-key", [fixture("quiz-level3.json")]),
    );
    const view = getQuizView(db, projectId, quizId);
    expect(view.questions.map((q) => q.type)).toEqual([
      "what_does_this_do",
      "what_does_this_do",
      "find_the_bug",
      "security",
      "how_would_you_change",
    ]);
    const serialised = JSON.stringify(view);
    expect(serialised).not.toContain("correctAnswer");
    expect(serialised).not.toContain("explanation");

    const first = view.questions[0]!;
    const after = await answerQuestion(
      projectId,
      quizId,
      first.id,
      "Only the logged-in user's todos, as JSON",
      db,
      new FakeProvider(),
    );
    expect(after.questions[0]!.result).toMatchObject({
      wasCorrect: true,
      correctAnswer: "Only the logged-in user's todos, as JSON",
    });
    expect(after.questions[1]!.result).toBeNull();
  });

  it("marks multiple choice without AI and free text with the fast model, and updates the profile", async () => {
    const quizId = await createQuiz(
      projectId,
      null,
      db,
      new FakeProvider("api-key", [fixture("quiz-level3.json")]),
    );
    const [, , bug, security] = getQuizView(db, projectId, quizId).questions;

    const noAi = new FakeProvider();
    await answerQuestion(projectId, quizId, security!.id, "It is slow", db, noAi);
    expect(noAi.requests).toHaveLength(0);
    expect(listProfile(db).find((c) => c.name === "sql injection")?.mastery).toBeCloseTo(0.25);

    const grader = new FakeProvider("api-key", [
      '{"correct":true,"feedback":"Betul! Title tak diperiksa.","concept":"input validation"}',
    ]);
    const graded = await answerQuestion(
      projectId,
      quizId,
      bug!.id,
      "Tak check title kosong",
      db,
      grader,
    );
    expect(grader.requests[0]!.model).toBe("claude-haiku-5-5");
    expect(grader.requests[0]!.context).toContain("<answer>\nTak check title kosong\n</answer>");
    expect(graded.questions[2]!.result?.feedback).toBe("Betul! Title tak diperiksa.");

    expect(quizHistory(db)[0]).toMatchObject({ answered: 2, correct: 1, total: 5 });
  });

  it("insists that a multiple-choice answer is one of the options", async () => {
    const bad = JSON.parse(fixture("quiz-level3.json"));
    bad.questions[0].correct_answer = "Something else entirely";
    const provider = new FakeProvider("api-key", [
      JSON.stringify(bad),
      fixture("quiz-level3.json"),
    ]);
    await createQuiz(projectId, null, db, provider);
    expect(provider.requests[1]!.messages.at(-1)!.content).toMatch(/exactly one of the options/);
  });

  it("refuses to quiz a level with no code", async () => {
    await expect(
      createQuiz(projectId, level("Testing").id, db, new FakeProvider()),
    ).rejects.toBeInstanceOf(HttpError);
  });
});

describe("remix challenges", () => {
  it("releases hints one at a time and reviews the attempt", async () => {
    const challenge = await createChallenge(
      projectId,
      db,
      new FakeProvider("api-key", [fixture("remix-todo.json")]),
    );
    expect(challenge.hints).toEqual([]);
    expect(challenge.hintsTotal).toBe(3);
    expect(challenge.skeleton[0]!.content).toContain("// TODO:");
    expect(JSON.stringify(challenge)).not.toContain("Number.isInteger"); // hints stay hidden

    const one = revealHint(projectId, challenge.id, db);
    expect(one.hints).toHaveLength(1);
    revealHint(projectId, challenge.id, db);
    revealHint(projectId, challenge.id, db);
    expect(revealHint(projectId, challenge.id, db).hints).toHaveLength(3); // never more than 3

    // Submitting the untouched skeleton is refused.
    await expect(
      reviewChallenge(projectId, challenge.id, challenge.skeleton, db, new FakeProvider()),
    ).rejects.toBeInstanceOf(HttpError);

    const attempt = [
      {
        path: "server/routes/recipes.js",
        content: challenge.skeleton[0]!.content.replace(
          "// TODO: GET",
          "router.get('/', h); // GET",
        ),
      },
    ];
    const reviewer = new FakeProvider("api-key", [
      '{"summary":"Good start.","verdicts":[{"check_id":"A1","passed":true,"explanation":"ok"},{"check_id":"A2","passed":true,"explanation":"ok"},{"check_id":"A3","passed":false,"explanation":"no validation"}],"concepts":[{"name":"input validation","layer":"backend","result":"missed","note":"no 400s"}]}',
    ]);
    const reviewed = await reviewChallenge(projectId, challenge.id, attempt, db, reviewer);
    expect(reviewed.status).toBe("reviewed");
    expect(reviewed.review?.verdicts.filter((v) => v.passed)).toHaveLength(2);
    expect(reviewer.requests[0]!.context).toContain("Hints used: 3 of 3.");
    expect(listProfile(db).find((c) => c.name === "input validation")?.mastery).toBeCloseTo(0.15);
  });
});
