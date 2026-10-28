// Opt-in live check: runs the main AI tasks against the to-do sample with the
// ACTIVE provider (the one chosen in Settings), using a throwaway in-memory
// database. It makes about 5 to 9 real model calls, so it only runs with --yes.
//
//   npm run live-check -- --yes            check every task's real output
//   npm run live-check -- --yes --record   also save the replies to tests/fixtures/ai/live/
//
// Nothing here touches your projects: the sample is ingested into memory.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDb, openDb, setDbForTests } from "../src/db/client";
import { analyzeAfterStore } from "../src/server/analysis/analyze";
import type { AIProvider, AIRequest } from "../src/server/ai/provider";
import { getProvider } from "../src/server/ai/registry";
import { annotateFile } from "../src/server/ai/tasks/annotate";
import { createRebuildSpec, reviewRebuild } from "../src/server/ai/tasks/rebuild";
import { generateRoadmap } from "../src/server/ai/tasks/roadmap";
import { prepareChat } from "../src/server/ai/tasks/tutor";
import { ingestZip } from "../src/server/ingest/ingest";
import { getFileContent, listFiles, listLevels } from "../src/server/repo/projects";
import { getSettings, updateSettings } from "../src/server/settings";
import { buildTodoZip } from "../tests/helpers/sample-zips";
import { writeTempZip } from "../tests/helpers/zips";

const args = new Set(process.argv.slice(2));
if (!args.has("--yes")) {
  console.log(
    "This makes real AI calls with your active provider. Run: npm run live-check -- --yes",
  );
  process.exit(1);
}
const RECORD_DIR = path.resolve("tests", "fixtures", "ai", "live");

/** Wraps the provider so every reply can be saved as a fixture. */
function recording(inner: AIProvider): AIProvider {
  let n = 0;
  const save = (request: AIRequest, reply: string) => {
    if (!args.has("--record")) return;
    mkdirSync(RECORD_DIR, { recursive: true });
    writeFileSync(
      path.join(RECORD_DIR, `${String(++n).padStart(2, "0")}-${request.task}.txt`),
      reply,
    );
  };
  return {
    ...inner,
    status: (fresh) => inner.status(fresh),
    async complete(request, signal) {
      const reply = await inner.complete(request, signal);
      save(request, reply);
      return reply;
    },
    async *stream(request, signal) {
      let reply = "";
      for await (const chunk of inner.stream(request, signal)) {
        reply += chunk;
        yield chunk;
      }
      save(request, reply);
    },
  };
}

async function step<T>(
  name: string,
  run: () => Promise<T>,
  describe: (value: T) => string,
): Promise<T | null> {
  const started = Date.now();
  try {
    const value = await run();
    console.log(
      `PASS  ${name} (${((Date.now() - started) / 1000).toFixed(1)}s): ${describe(value)}`,
    );
    return value;
  } catch (error) {
    console.log(`FAIL  ${name}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

const real = getSettings(getDb());
const provider = recording(getProvider(real.activeProvider));
const status = await provider.status(true);
console.log(`Provider: ${status.label}. ${status.detail}`);
if (!status.ready) {
  console.log(`Not ready. ${status.fix ?? ""}`);
  process.exit(1);
}

// A throwaway database with the same provider and models.
const db = openDb(":memory:");
setDbForTests(db);
updateSettings(
  {
    activeProvider: real.activeProvider,
    tutorModel: real.tutorModel,
    fastModel: real.fastModel,
    learnerName: real.learnerName,
  },
  db,
);
const projectId = await ingestZip(
  {
    zipPath: writeTempZip(await buildTodoZip()),
    name: "todo-express-react",
    source: "zip",
    sourceRef: "todo-express-react.zip",
    afterStore: analyzeAfterStore({ kind: "zip" }),
  },
  db,
);

let failed = 0;
const track = <T>(value: T | null) => {
  if (value === null) failed++;
  return value;
};

await track(
  await step(
    "roadmap",
    () => generateRoadmap(projectId, db, provider),
    () => {
      const levels = listLevels(projectId, db);
      return `${levels.length} levels, ${levels.filter((l) => l.skipped).length} skipped`;
    },
  ),
);
const todos = listFiles(projectId, db).find((f) => f.path === "server/routes/todos.js")!;
track(
  await step(
    "annotate",
    () => annotateFile(projectId, todos.id, { depth: "beginner" }, db, provider),
    (notes) => `${notes.length} notes`,
  ),
);

track(
  await step(
    "chat (streamed)",
    async () => {
      const task = prepareChat(
        { projectId, fileId: todos.id, message: "Kenapa /search route ni bahaya?" },
        db,
        provider,
      );
      let text = "";
      for await (const chunk of task.provider.stream(task.request)) text += chunk;
      task.save(text);
      return text;
    },
    (text) => `${text.length} chars: ${text.slice(0, 80).replace(/\s+/g, " ")}…`,
  ),
);

const level = listLevels(projectId, db).find(
  (l) => !l.skipped && l.number > 0 && listFiles(projectId, db).some((f) => f.levelId === l.id),
);
if (level) {
  const attempt = track(
    await step(
      "rebuild spec",
      () => createRebuildSpec(projectId, level.id, db, provider),
      (a) => `"${a.spec.title}", ${a.spec.acceptance_checks.length} checks`,
    ),
  );
  if (attempt) {
    const files = attempt.files.map((f) => {
      const original = listFiles(projectId, db).find((o) => o.path === f.path);
      return {
        path: f.path,
        content: original ? getFileContent(projectId, original.id, db).content : "// not written",
      };
    });
    track(
      await step(
        "rebuild review",
        () => reviewRebuild(projectId, attempt.id, files, db, provider),
        (a) =>
          `${a.review?.verdicts.filter((v) => v.passed).length}/3 checks passed, ${a.review?.security_gaps.length} security gaps`,
      ),
    );
  }
}

console.log(failed === 0 ? "\nAll live checks passed." : `\n${failed} live check(s) failed.`);
if (args.has("--record"))
  console.log(`Replies saved to ${path.relative(process.cwd(), RECORD_DIR)}`);
process.exit(failed === 0 ? 0 : 1);
