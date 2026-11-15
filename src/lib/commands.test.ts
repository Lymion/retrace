import { describe, expect, it } from "vitest";
import {
  complete,
  filterEntries,
  findProject,
  paletteEntries,
  runCommand,
  shellPath,
} from "./commands";

const projects = [
  { id: 4, name: "todo-express-react", fileCount: 23, source: "zip" },
  { id: 5, name: "flask-notes", fileCount: 9, source: "zip" },
  { id: 6, name: "flask-api", fileCount: 3, source: "github" },
];
const at = (pathname: string) => ({ pathname, projects });

describe("runCommand", () => {
  it("navigates with cd, by name, id, unique start, or into a sub-page", () => {
    expect(runCommand("cd todo-express-react", at("/")).navigate).toBe("/projects/4");
    expect(runCommand("cd 5", at("/")).navigate).toBe("/projects/5");
    expect(runCommand("cd todo", at("/")).navigate).toBe("/projects/4");
    expect(runCommand("cd flask-notes/workspace", at("/")).navigate).toBe("/projects/5/workspace");
    expect(runCommand("cd ~/settings", at("/projects/4")).navigate).toBe("/settings");
  });

  it("goes up one level with cd .. and home with cd, cd ~ or home", () => {
    expect(runCommand("cd ..", at("/projects/4/workspace")).navigate).toBe("/projects/4");
    expect(runCommand("cd ..", at("/projects/4")).navigate).toBe("/");
    expect(runCommand("cd", at("/settings")).navigate).toBe("/");
    expect(runCommand("cd ~", at("/progress")).navigate).toBe("/");
    expect(runCommand("home", at("/progress")).navigate).toBe("/");
  });

  it("reports ambiguous and unknown projects instead of guessing", () => {
    const ambiguous = runCommand("cd flask", at("/"));
    expect(ambiguous.navigate).toBeUndefined();
    expect(ambiguous.lines[0]).toEqual({
      text: "cd: ambiguous: flask-notes, flask-api",
      tone: "error",
    });
    expect(runCommand("cd nope", at("/")).lines[0]?.text).toBe("cd: no such project: nope");
  });

  it("opens the workspace or challenge of the named project, or the current one", () => {
    expect(runCommand("open flask-notes", at("/")).navigate).toBe("/projects/5/workspace");
    expect(runCommand("open", at("/projects/4")).navigate).toBe("/projects/4/workspace");
    expect(runCommand("remix", at("/projects/6/workspace")).navigate).toBe("/projects/6/challenge");
    expect(runCommand("open", at("/")).lines[0]?.text).toBe(
      "open: which project? Try: open <name>",
    );
  });

  it("accepts a retrace prefix, a vim-style colon and aliases", () => {
    expect(runCommand(":progress", at("/")).navigate).toBe("/progress");
    expect(runCommand("retrace progress", at("/")).navigate).toBe("/progress");
    expect(runCommand("config", at("/")).navigate).toBe("/settings");
    expect(runCommand("ws todo", at("/")).navigate).toBe("/projects/4/workspace");
  });

  it("lists projects, prints the path and explains unknown commands", () => {
    const ls = runCommand("ls", at("/")).lines.map((l) => l.text);
    expect(ls).toHaveLength(3);
    expect(ls[1]).toContain("flask-notes");
    expect(ls[1]).toContain("9 files");
    expect(runCommand("ls", { pathname: "/", projects: [] }).lines[0]?.text).toMatch(/no projects/);
    expect(runCommand("pwd", at("/projects/5/workspace")).lines[0]?.text).toBe(
      "~/flask-notes/workspace",
    );
    expect(runCommand("rm -rf /", at("/")).lines[0]).toEqual({
      text: "retrace: command not found: rm. Type help for the list.",
      tone: "error",
    });
  });

  it("clears, goes back, and ignores blank input", () => {
    expect(runCommand("clear", at("/")).clear).toBe(true);
    expect(runCommand("back", at("/")).back).toBe(true);
    expect(runCommand("   ", at("/"))).toEqual({ lines: [] });
    expect(runCommand("help", at("/")).lines.length).toBeGreaterThan(5);
  });
});

describe("shellPath and findProject", () => {
  it("shows project pages by name", () => {
    expect(shellPath("/", projects)).toBe("~");
    expect(shellPath("/settings", projects)).toBe("~/settings");
    expect(shellPath("/projects/4", projects)).toBe("~/todo-express-react");
    expect(shellPath("/projects/99/challenge", projects)).toBe("~/99/challenge");
  });

  it("prefers an exact name over a longer one that starts the same", () => {
    const list = [
      { id: 1, name: "notes" },
      { id: 2, name: "notes-v2" },
    ];
    expect(findProject("notes", list)).toEqual({ project: list[0] });
  });
});

describe("complete", () => {
  it("completes commands and project names", () => {
    expect(complete("prog", projects)).toEqual({ value: "progress ", options: [] });
    expect(complete("cd to", projects)).toEqual({ value: "cd todo-express-react", options: [] });
    const flask = complete("open fl", projects);
    expect(flask.value).toBe("open flask-");
    expect(flask.options).toEqual(["flask-notes", "flask-api"]);
  });

  it("leaves arguments alone for commands that take none", () => {
    expect(complete("ls fl", projects)).toEqual({ value: "ls fl", options: [] });
  });
});

describe("command list (Ctrl K)", () => {
  const projects = [
    { id: 4, name: "todo-express-react" },
    { id: 5, name: "flask-notes" },
  ];

  it("offers the screens and every project's pages, current project first", () => {
    const entries = paletteEntries("/projects/5", projects);
    expect(entries[0]).toEqual({
      label: "open flask-notes",
      hint: "workspace · this project",
      input: "open 5",
    });
    expect(entries.map((e) => e.label)).toContain("open todo-express-react");
    expect(entries.filter((e) => e.label === "open flask-notes")).toHaveLength(1);
    // Every entry is a real command that goes somewhere.
    for (const entry of entries) {
      const result = runCommand(entry.input, { pathname: "/projects/5", projects });
      expect(result.navigate !== undefined || result.back).toBe(true);
    }
  });

  it("filters by every typed word, labels that start with the first word first", () => {
    const entries = paletteEntries("/", projects);
    expect(filterEntries(entries, "").length).toBe(entries.length);
    expect(filterEntries(entries, "open flask").map((e) => e.input)).toEqual(["open 5"]);
    expect(filterEntries(entries, "set")[0]!.label).toBe("settings");
    expect(filterEntries(entries, "zzz")).toEqual([]);
  });
});
