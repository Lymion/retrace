import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type Zippable, zipSync } from "fflate";
import git from "isomorphic-git";

// Packs the sample projects into zips the way a learner would upload them.
// The to-do app also gets a scripted git history in build order, so the
// roadmap can be tested against "git" evidence as well as "deps".

export const SAMPLES_DIR = path.resolve(import.meta.dirname, "..", "..", "samples");

export interface CommitPlan {
  message: string;
  paths: string[];
}

/** The order a developer would really have written the to-do app in. */
export const TODO_HISTORY: CommitPlan[] = [
  { message: "Idea: what the app does", paths: ["README.md", ".gitignore"] },
  { message: "Set up the server project", paths: ["server/package.json", ".env.example"] },
  { message: "Design the tables", paths: ["server/schema.sql", "server/db.js"] },
  {
    message: "Express server with todo routes",
    paths: ["server/app.js", "server/index.js", "server/routes/todos.js"],
  },
  {
    message: "Signup, login and JWT",
    paths: ["server/middleware/auth.js", "server/routes/auth.js"],
  },
  {
    message: "React skeleton",
    paths: [
      "client/package.json",
      "client/vite.config.js",
      "client/index.html",
      "client/src/main.jsx",
      "client/src/App.jsx",
      "client/src/pages/Login.jsx",
      "client/src/pages/Todos.jsx",
    ],
  },
  { message: "Connect the client to the API", paths: ["client/src/api.js"] },
];

function listFiles(root: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(root, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(root, relative));
    else out.push(relative);
  }
  return out;
}

async function addHistory(dir: string, plan: CommitPlan[]): Promise<void> {
  await git.init({ fs, dir, defaultBranch: "main" });
  // A fixed clock keeps the history identical on every run.
  let timestamp = Date.UTC(2025, 0, 6) / 1000;
  for (const commit of plan) {
    for (const filepath of commit.paths) await git.add({ fs, dir, filepath });
    await git.commit({
      fs,
      dir,
      message: commit.message,
      author: { name: "Sample Author", email: "sample@example.com", timestamp, timezoneOffset: 0 },
    });
    timestamp += 86_400;
  }
}

/** Zips a sample folder under a top-level folder, optionally with git history. */
export async function buildSampleZip(sample: string, history?: CommitPlan[]): Promise<Buffer> {
  const source = path.join(SAMPLES_DIR, sample);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), `retrace-sample-${sample}-`));
  try {
    fs.cpSync(source, work, { recursive: true });
    if (history) await addHistory(work, history);

    const files: Zippable = {};
    for (const relative of listFiles(work)) {
      files[`${sample}/${relative}`] = new Uint8Array(fs.readFileSync(path.join(work, relative)));
    }
    return Buffer.from(zipSync(files, { level: 6 }));
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

export const buildTodoZip = () => buildSampleZip("todo-express-react", TODO_HISTORY);
export const buildFlaskZip = () => buildSampleZip("flask-notes");
