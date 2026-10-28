// The command line in the status bar. Commands only move around the app and
// list what is there: nothing here runs code, sends anything to the tutor or
// changes data. Pure functions, so they are easy to test.

export interface CommandProject {
  id: number;
  name: string;
  fileCount?: number | null;
  source?: string;
}

export interface OutputLine {
  text: string;
  tone?: "muted" | "ok" | "error" | "accent";
}

export interface CommandResult {
  lines: OutputLine[];
  navigate?: string;
  back?: boolean;
  clear?: boolean;
}

export const COMMANDS = [
  { name: "help", usage: "help", about: "list these commands" },
  { name: "ls", usage: "ls", about: "list your projects" },
  { name: "cd", usage: "cd <project> | .. | ~", about: "go to a project, up one level, or home" },
  { name: "open", usage: "open [project]", about: "open a project's workspace" },
  { name: "remix", usage: "remix [project]", about: "open a project's remix challenge" },
  { name: "progress", usage: "progress", about: "your progress dashboard" },
  { name: "settings", usage: "settings", about: "provider, models and limits (or: config)" },
  { name: "pwd", usage: "pwd", about: "print where you are" },
  { name: "back", usage: "back", about: "go back one screen" },
  { name: "clear", usage: "clear", about: "clear this output" },
] as const;

const ALIASES: Record<string, string> = {
  config: "settings",
  "?": "help",
  dir: "ls",
  ws: "open",
  workspace: "open",
  challenge: "remix",
  home: "cd",
  cls: "clear",
};

/** Commands whose argument is a project name, for Tab completion. */
const TAKES_PROJECT = new Set(["cd", "open", "remix"]);

/** The project id in a pathname like /projects/4/workspace. */
function projectIdIn(pathname: string): number | null {
  const match = /^\/projects\/(\d+)/.exec(pathname);
  return match ? Number(match[1]) : null;
}

/** The pathname as a shell path: /projects/4/workspace → ~/flask-notes/workspace. */
export function shellPath(pathname: string, projects: CommandProject[]): string {
  const id = projectIdIn(pathname);
  if (id !== null) {
    const name = projects.find((p) => p.id === id)?.name ?? String(id);
    const rest = pathname.replace(/^\/projects\/\d+/, "");
    return `~/${name}${rest}`;
  }
  return pathname === "/" ? "~" : `~${pathname}`;
}

function parentOf(pathname: string): string {
  const id = projectIdIn(pathname);
  if (id !== null && pathname !== `/projects/${id}`) return `/projects/${id}`;
  return "/";
}

type Found = { project: CommandProject } | { error: string };

/** Finds a project by id, exact name, or a unique start of its name. */
export function findProject(query: string, projects: CommandProject[]): Found {
  const q = query.trim().toLowerCase();
  const byId = /^\d+$/.test(q) ? projects.find((p) => p.id === Number(q)) : undefined;
  if (byId) return { project: byId };
  const exact = projects.find((p) => p.name.toLowerCase() === q);
  if (exact) return { project: exact };
  const starts = projects.filter((p) => p.name.toLowerCase().startsWith(q));
  if (starts.length === 1) return { project: starts[0]! };
  if (starts.length > 1) return { error: `ambiguous: ${starts.map((p) => p.name).join(", ")}` };
  return { error: `no such project: ${query}` };
}

const say = (text: string, tone?: OutputLine["tone"]): OutputLine => ({ text, tone });

function projectOrHere(
  arg: string | undefined,
  pathname: string,
  projects: CommandProject[],
  command: string,
): Found {
  if (arg) return findProject(arg, projects);
  const id = projectIdIn(pathname);
  const here = id === null ? undefined : projects.find((p) => p.id === id);
  if (here) return { project: here };
  if (id !== null) return { project: { id, name: String(id) } };
  return { error: `which project? Try: ${command} <name>` };
}

export function runCommand(
  input: string,
  { pathname, projects }: { pathname: string; projects: CommandProject[] },
): CommandResult {
  // "retrace ls" and vim-style ":ls" work as well as "ls".
  const words = input
    .trim()
    .replace(/^:+\s*/, "")
    .replace(/^retrace\s+/, "")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return { lines: [] };
  const typed = words[0]!.toLowerCase();
  const name = ALIASES[typed] ?? typed;
  const arg = words.slice(1).join(" ") || undefined;

  switch (name) {
    case "help": {
      const width = Math.max(...COMMANDS.map((c) => c.usage.length)) + 2;
      return {
        lines: [
          ...COMMANDS.map((c) => say(`  ${c.usage.padEnd(width)}${c.about}`)),
          say("Tab completes · ↑/↓ history · Esc closes · press : from anywhere", "muted"),
        ],
      };
    }
    case "ls": {
      if (projects.length === 0)
        return { lines: [say("no projects yet: upload one on ~", "muted")] };
      const width = Math.max(...projects.map((p) => p.name.length)) + 2;
      return {
        lines: projects.map((p) =>
          say(
            `  ${String(p.id).padStart(3)}  ${p.name.padEnd(width)}${p.fileCount ?? 0} files  ${p.source ?? ""}`.trimEnd(),
            "accent",
          ),
        ),
      };
    }
    case "pwd":
      return { lines: [say(shellPath(pathname, projects))] };
    case "clear":
      return { lines: [], clear: true };
    case "back":
      return { lines: [], back: true };
    case "progress":
      return { lines: [], navigate: "/progress" };
    case "settings":
      return { lines: [], navigate: "/settings" };
    case "cd": {
      if (typed === "home" || !arg || arg === "~" || arg === "/" || arg === "~/")
        return { lines: [], navigate: "/" };
      if (arg === "..") return { lines: [], navigate: parentOf(pathname) };
      const [first, second] = arg.replace(/^~\//, "").split("/").filter(Boolean);
      if (!first) return { lines: [], navigate: "/" };
      if (first === "settings" || first === "progress") return { lines: [], navigate: `/${first}` };
      const found = findProject(first, projects);
      if ("error" in found) return { lines: [say(`cd: ${found.error}`, "error")] };
      if (!second) return { lines: [], navigate: `/projects/${found.project.id}` };
      if (second === "workspace" || second === "challenge")
        return { lines: [], navigate: `/projects/${found.project.id}/${second}` };
      return { lines: [say(`cd: no such folder: ${second}`, "error")] };
    }
    case "open":
    case "remix": {
      const found = projectOrHere(arg, pathname, projects, name);
      if ("error" in found) return { lines: [say(`${name}: ${found.error}`, "error")] };
      const page = name === "open" ? "workspace" : "challenge";
      return { lines: [], navigate: `/projects/${found.project.id}/${page}` };
    }
    default:
      return {
        lines: [say(`retrace: command not found: ${typed}. Type help for the list.`, "error")],
      };
  }
}

function commonPrefix(values: string[]): string {
  if (values.length === 0) return "";
  let prefix = values[0]!;
  for (const v of values.slice(1)) {
    while (!v.toLowerCase().startsWith(prefix.toLowerCase())) prefix = prefix.slice(0, -1);
  }
  return prefix;
}

/** Tab completion: the completed input, plus the choices when more than one fits. */
export function complete(
  input: string,
  projects: CommandProject[],
): { value: string; options: string[] } {
  const space = input.indexOf(" ");
  if (space === -1) {
    const names = [...COMMANDS.map((c) => c.name), ...Object.keys(ALIASES)].filter(
      (n) => n !== "?" && n.startsWith(input.toLowerCase()),
    );
    if (names.length === 1) return { value: `${names[0]} `, options: [] };
    const prefix = commonPrefix(names);
    return {
      value: prefix.length > input.length ? prefix : input,
      options: names.length > 1 ? names : [],
    };
  }
  const command = input.slice(0, space).toLowerCase();
  if (!TAKES_PROJECT.has(ALIASES[command] ?? command)) return { value: input, options: [] };
  const partial = input.slice(space + 1).trimStart();
  const names = projects
    .map((p) => p.name)
    .filter((n) => n.toLowerCase().startsWith(partial.toLowerCase()));
  const head = input.slice(0, space + 1);
  if (names.length === 1) return { value: `${head}${names[0]}`, options: [] };
  const prefix = commonPrefix(names);
  return {
    value: prefix.length > partial.length ? `${head}${prefix}` : input,
    options: names.length > 1 ? names : [],
  };
}
