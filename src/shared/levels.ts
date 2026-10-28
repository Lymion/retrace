// The brief's level system: build order, not runtime order. Level 0 is the
// idea, the last level is shipping, and each level ends with a checkpoint
// that leaves the project in a state that runs.

export interface LevelTemplate {
  number: number;
  name: string;
  builds: string;
  checkpoint: string;
}

export const WEB_LEVELS: LevelTemplate[] = [
  {
    number: 0,
    name: "Idea and scope",
    builds: "User stories, core features, what is out of scope",
    checkpoint: "Explain the app in 3 sentences",
  },
  {
    number: 1,
    name: "Project setup",
    builds: "Repo, folders, package manager, env vars, linter",
    checkpoint: "An empty project runs",
  },
  {
    number: 2,
    name: "Data design",
    builds: "Schema, models, types",
    checkpoint: "Draw the tables and relationships",
  },
  {
    number: 3,
    name: "Backend core",
    builds: "Server, routes, DB connection, basic CRUD",
    checkpoint: "An endpoint returns data",
  },
  {
    number: 4,
    name: "Auth and sessions",
    builds: "Signup, login, tokens, password hashing",
    checkpoint: "A protected route rejects strangers",
  },
  {
    number: 5,
    name: "Frontend skeleton",
    builds: "Routing, layout, static components",
    checkpoint: "Click through empty screens",
  },
  {
    number: 6,
    name: "Connect the two",
    builds: "API calls, state, loading and error states",
    checkpoint: "Real data shows on screen",
  },
  {
    number: 7,
    name: "Feature logic",
    builds: "The features that make the app useful",
    checkpoint: "Use the app end to end",
  },
  {
    number: 8,
    name: "Validation and errors",
    builds: "Input checks, error handling, edge cases",
    checkpoint: "Bad input does not crash it",
  },
  {
    number: 9,
    name: "Testing",
    builds: "Unit, integration, manual test plan",
    checkpoint: "Change code without fear",
  },
  {
    number: 10,
    name: "Security hardening",
    builds: "Rate limits, CORS, secrets, injection and XSS fixes",
    checkpoint: "Pass your own security audit",
  },
  {
    number: 11,
    name: "Polish",
    builds: "Performance, accessibility, responsive design",
    checkpoint: "A stranger can use it",
  },
  {
    number: 12,
    name: "Ship and maintain",
    builds: "Deployment, CI/CD, logging, monitoring, backups",
    checkpoint: "It runs in production",
  },
];

export function templateTable(levels: LevelTemplate[] = WEB_LEVELS): string {
  return levels
    .map((l) => `${l.number} | ${l.name} | ${l.builds} | Checkpoint: ${l.checkpoint}`)
    .join("\n");
}
