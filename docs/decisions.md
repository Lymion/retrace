# Decisions

Why each dependency is here, and the small decisions made along the way.
Big decisions (stack changes, new services, cut features) are asked first.

## Dependencies

### Runtime

| Package                          | Why                                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `next`, `react`, `react-dom`     | The brief's app framework: pages and API routes in one local server.                                       |
| `typescript` (5.9, runtime dep)  | Strict typing, and the compiler API (`ts.preProcessFile`) reads JS/TS imports from uploads at runtime.     |
| `drizzle-orm`                    | Typed queries and migrations over SQLite; every query is parameterised, so no SQL injection by hand.       |
| `better-sqlite3`                 | Fast, synchronous SQLite driver for Node with prebuilt binaries, so no compiler is needed on install.      |
| `zod`                            | Validates every request body, env var and model JSON output against one schema.                            |
| `yauzl`                          | Streaming zip reader that checks real vs declared sizes and exposes symlink bits, so extraction is safe.   |
| `isomorphic-git`                 | Reads git history in pure JS: no git binary, no hooks from the upload can ever run.                        |
| `@anthropic-ai/sdk`              | The api-key provider: official SDK with streaming and prompt caching.                                      |
| `@anthropic-ai/claude-agent-sdk` | The claude-login provider: official SDK that uses the learner's own Claude login and bundles its CLI.      |
| `monaco-editor`                  | The code viewer and rebuild editor (same editor as VS Code: gutter markers, inline zones, many languages). |
| `@monaco-editor/react`           | Thin React wrapper for Monaco that handles loading and disposal.                                           |
| `react-markdown`                 | Renders the tutor's markdown as React elements; raw HTML is never rendered (no `rehype-raw`).              |
| `remark-gfm`                     | Tables, task lists and strikethrough in tutor markdown.                                                    |

### Dev only

| Package                                 | Why                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| `drizzle-kit`                           | Generates SQL migrations from `src/db/schema.ts`.                                          |
| `vitest`                                | Fast TypeScript test runner, no extra config for ESM.                                      |
| `eslint`, `eslint-config-next`          | Linting with the Next.js and TypeScript rule sets.                                         |
| `prettier`                              | One code format, so diffs only show real changes.                                          |
| `tailwindcss`, `@tailwindcss/turbopack` | Utility CSS from the brief; the Turbopack loader is what Next 16.4 scaffolds.              |
| `fflate`                                | Builds hostile zip files in tests and the sample-project zips. Never used to read uploads. |
| `tsx`                                   | Runs the TypeScript scripts in `/scripts` (migrate, sample zips, live check).              |
| `@types/*`                              | Type definitions for Node, React, better-sqlite3 and yauzl.                                |

## Decisions

- **TypeScript 5.9, not 7.0.** TS 7 is the native (Go) port and does not ship the same JS
  compiler API. The brief needs that API to read imports, so we stay on the last 5.x line.
- **App lives at the repo root** (`C:\CodeHelper`), not in a subfolder.
- **Integer ids** for all tables: short URLs like `/projects/3`, and SQLite handles them natively.
- **No `cacheComponents`.** Every page renders per request (the root layout reads headers).
  This is a single-user local app, and per-request rendering is required for CSP nonces anyway.
- **CSP**: scripts need the per-request nonce (`'strict-dynamic'`); styles allow inline because
  Monaco injects `<style>` tags at runtime. Styles cannot execute code.
- **Monaco is served from `/public/monaco`** (copied on install), not a CDN, so `script-src` stays
  on our own origin.
- **`dompurify` override (>= 3.4.17)**: `monaco-editor` 0.57 pins a version with known XSS advisories.
- **Known dev-only advisory**: `drizzle-kit` pulls an old `esbuild` with a dev-server advisory. We
  never run esbuild's dev server (no `drizzle-kit studio`), so it does not affect this app.
- **System fonts** instead of `next/font/google`, so the app works offline and makes no font requests.
- **Settings override env vars.** `.env` gives defaults (models, limits); the Settings screen can
  change them at runtime without a restart.
- **Database connection on `globalThis`**, because Next.js dev can load a module once per route
  bundle and SQLite works best with one connection per process.
