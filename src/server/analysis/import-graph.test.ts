import { describe, expect, it } from "vitest";
import { detectLanguage } from "../ingest/language";
import { buildImportGraph } from "./import-graph";

const project = (files: Record<string, string>) =>
  Object.entries(files).map(([path, content]) => ({
    path,
    content,
    language: detectLanguage(path),
  }));

const edgesOf = (files: Record<string, string>) =>
  buildImportGraph(project(files))
    .edges.map((e) => `${e.from} -> ${e.to}`)
    .sort();

describe("JavaScript and TypeScript", () => {
  it("resolves relative imports, requires and dynamic imports", () => {
    expect(
      edgesOf({
        "src/index.ts":
          'import { a } from "./a";\nconst b = require("./lib/b");\nconst c = await import("./c.js");',
        "src/a.ts": "export const a = 1;",
        "src/lib/b/index.js": "module.exports = 2;",
        "src/c.ts": "export default 3;",
      }),
    ).toEqual([
      "src/index.ts -> src/a.ts",
      "src/index.ts -> src/c.ts",
      "src/index.ts -> src/lib/b/index.js",
    ]);
  });

  it("resolves the @/ alias and tsconfig paths", () => {
    expect(
      edgesOf({
        "tsconfig.json":
          '{ // comment\n "compilerOptions": { "paths": { "#lib/*": ["./lib/*"] } } }',
        "src/app/page.tsx":
          'import { Button } from "@/components/Button";\nimport { util } from "#lib/util";',
        "src/components/Button.tsx": "export function Button() {}",
        "lib/util.ts": "export const util = 1;",
      }),
    ).toEqual(["src/app/page.tsx -> lib/util.ts", "src/app/page.tsx -> src/components/Button.tsx"]);
  });

  it("records packages but not Node built-ins", () => {
    const graph = buildImportGraph(
      project({
        "a.js":
          'const fs = require("fs");\nimport x from "node:path";\nimport q from "@tanstack/react-query/core";\nimport e from "express";',
      }),
    );
    expect(graph.external.map((e) => e.name).sort()).toEqual(["@tanstack/react-query", "express"]);
    expect(graph.edges).toEqual([]);
  });

  it("links code to the SQL file it loads", () => {
    expect(
      edgesOf({
        "server/db.js": 'fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8")',
        "server/schema.sql": "create table x (id int);",
      }),
    ).toEqual(["server/db.js -> server/schema.sql"]);
  });

  it("follows script tags in index.html (Vite style)", () => {
    expect(
      edgesOf({
        "client/index.html": '<script type="module" src="/src/main.jsx"></script>',
        "client/src/main.jsx": "",
      }),
    ).toEqual(["client/index.html -> client/src/main.jsx"]);
  });
});

describe("Python", () => {
  it("resolves absolute, relative and package imports", () => {
    expect(
      edgesOf({
        "app.py": "from config import Config\nfrom notes.routes import bp\nimport db",
        "config.py": "",
        "db.py": "import sqlite3",
        "notes/__init__.py": "",
        "notes/routes.py": "from .models import list_notes\nfrom flask import Blueprint",
        "notes/models.py": "from db import get_db",
      }),
    ).toEqual([
      "app.py -> config.py",
      "app.py -> db.py",
      "app.py -> notes/routes.py",
      "notes/models.py -> db.py",
      "notes/routes.py -> notes/models.py",
    ]);
  });

  it("treats unknown modules as packages and skips the standard library", () => {
    const graph = buildImportGraph(
      project({ "a.py": "import os, sys\nfrom flask import Flask\nimport requests" }),
    );
    expect(graph.external.map((e) => e.name).sort()).toEqual(["flask", "requests"]);
  });

  it("links render_template and Jinja extends to template files", () => {
    expect(
      edgesOf({
        "routes.py": 'return render_template("index.html")',
        "templates/index.html": '{% extends "base.html" %}',
        "templates/base.html": "<html></html>",
      }),
    ).toEqual(["routes.py -> templates/index.html", "templates/index.html -> templates/base.html"]);
  });
});

describe("other languages", () => {
  it("handles C includes, Ruby require_relative and CSS imports", () => {
    expect(
      edgesOf({
        "main.cpp": '#include "sensor.h"\n#include <Arduino.h>',
        "sensor.h": "",
        "app.rb": 'require_relative "lib/helper"',
        "lib/helper.rb": "",
        "styles/app.css": '@import "./base.css";',
        "styles/base.css": "",
      }),
    ).toEqual([
      "app.rb -> lib/helper.rb",
      "main.cpp -> sensor.h",
      "styles/app.css -> styles/base.css",
    ]);
  });
});
