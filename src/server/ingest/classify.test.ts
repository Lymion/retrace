import { describe, expect, it } from "vitest";
import { classifyPath, looksBinary } from "./ignore";
import { detectLanguage } from "./language";
import { guessLayer } from "./layer";

describe("classifyPath", () => {
  it.each([
    ["node_modules/react/index.js", "dependency folder"],
    ["server/node_modules/x.js", "dependency folder"],
    [".venv/lib/site.py", "dependency folder"],
    ["dist/bundle.js", "build output"],
    ["__pycache__/app.cpython-311.pyc", "build output"],
    ["public/app.min.js", "build output"],
    ["package-lock.json", "lockfile"],
    ["assets/logo.PNG", "binary or media"],
    ["data/app.sqlite", "binary or media"],
    ["certs/server.pem", "key or certificate"],
    [".ssh/id_rsa", "key or certificate"],
    [".DS_Store", "editor or OS file"],
    [".idea/workspace.xml", "editor or OS file"],
  ])("skips %s as %s", (filePath, reason) => {
    expect(classifyPath(filePath)).toBe(reason);
  });

  it.each(["src/index.ts", "README.md", ".env", "Dockerfile", "server/routes/build.js"])(
    "keeps %s",
    (filePath) => {
      expect(classifyPath(filePath)).toBeNull();
    },
  );

  it("spots binary content", () => {
    expect(looksBinary(Buffer.from([0x50, 0x4b, 0x00, 0x01]))).toBe(true);
    expect(looksBinary(Buffer.from("plain text"))).toBe(false);
  });
});

describe("detectLanguage", () => {
  it.each([
    ["a.tsx", "typescript"],
    ["a.jsx", "javascript"],
    ["app.py", "python"],
    ["Dockerfile", "dockerfile"],
    [".env", "ini"],
    ["schema.sql", "sql"],
    ["notes", "plaintext"],
  ])("%s -> %s", (filePath, language) => {
    expect(detectLanguage(filePath)).toBe(language);
  });
});

describe("guessLayer", () => {
  it.each([
    ["server/package.json", "config"],
    [".env.example", "config"],
    ["config.py", "config"],
    [".github/workflows/ci.yml", "config"],
    ["server/schema.sql", "database"],
    ["server/db.js", "database"],
    ["notes/models.py", "database"],
    ["server/middleware/auth.js", "security"],
    ["server/routes/auth.js", "security"],
    ["client/src/pages/Login.jsx", "frontend"],
    ["client/src/api.js", "frontend"],
    ["templates/index.html", "frontend"],
    ["server/routes/todos.js", "backend"],
    ["app.py", "backend"],
    ["tests/test_notes.py", "test"],
    ["src/utils.test.ts", "test"],
    ["README.md", "other"],
  ])("%s -> %s", (filePath, layer) => {
    expect(guessLayer(filePath)).toBe(layer);
  });
});
