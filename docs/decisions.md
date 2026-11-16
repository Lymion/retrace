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

### Phase 4: AI layer and roadmap

- **One `AIRequest` shape for both providers**: system prompt, cached project fact sheet, then an
  uncached block with the task, level, open file and learner profile, then the messages. That is
  the brief's context order, and only the provider decides how to send it.
- **Every `<file>` block has numbered lines**, so the model can cite `file:line`. A literal
  `</file>` inside uploaded text is broken up so the upload cannot close the tag and pose as
  instructions.
- **Files over 600 lines** send the focused range (plus 80 lines either side), or the first 300
  lines, and an outline of declarations for the rest. The outline is built locally; no extra AI call.
- **A deterministic draft roadmap** (layer + file name -> template level) is given to the model as
  a starting point. Files the model leaves out keep their draft level, so long projects need a
  shorter reply and no file is ever left without a level.
- **The roadmap guard** drops any path not in the upload, places each file once, marks levels
  without files as skipped (except Level 0, the idea), and downgrades "git" evidence when there is
  no history. The model cannot break these rules even if it tries.
- **Rebuilding the roadmap resets level progress** (levels are recreated). The UI asks first.
- **The output schemas for every task live in `src/shared/contracts.ts` from this phase on**, so
  Tier 2 features add prompts and screens, not new data shapes.
- **Rate limit**: one in-memory token bucket for all AI routes (`AI_RATE_LIMIT_PER_MIN`, default 20).

### Phase 5: provider switch

- **The claude-login child process gets an allowlisted environment** (OS basics, `CLAUDE_CONFIG_DIR`
  and proxy settings only) instead of a copy of `process.env` with the key removed. When Retrace
  runs inside another Claude tool, the server inherits dozens of `CLAUDE_CODE_*`/`ANTHROPIC_*`
  variables, including tokens and a base URL; an allowlist guarantees none of them reach the child.
- **Lockdown is belt and braces**: `tools: []`, every built-in tool name in `disallowedTools`,
  `permissionMode: "dontAsk"`, a `canUseTool` that always denies, `maxTurns: 1`, no setting
  sources, skills, plugins or MCP servers, `persistSession: false`, and a fresh empty temp folder
  as `cwd` for every call.
- **Login check**: Claude Code's `accountInfo()` reports the saved account without proving the
  session still works (an expired session still looks signed in). So a failed call marks the
  provider not ready, and "Check again" proves the login with a one-word reply on the fast model.
  The automatic check never spends plan usage.
- **The api-key provider pins `baseURL` to `https://api.anthropic.com`**, so an inherited
  `ANTHROPIC_BASE_URL` can never send the key somewhere else.
- **Switching to a provider that is not ready is refused server-side** (409), not just disabled
  in the UI.
- **Multi-turn context for claude-login** is sent as one prompt with `<learner>`/`<tutor>` turns,
  since each call is a fresh single-turn session.

### Phases 6 to 8: workspace, tutor, rebuild

- **Notes are cached per file and depth** and only written when a file is first opened at that
  depth, so browsing costs one AI call per file at most.
- **Monaco view zones for inline notes are built with `textContent`**, never HTML, since notes are
  model output.
- **Streaming**: the server waits for the first chunk before answering, so most failures come back
  as normal JSON errors with the provider id (for the one-click switch). A failure mid-stream ends
  the text with a marker the client turns into an error.
- **Chat turns are saved together once the reply completes**, so a failed request and its retry
  never leave a question without an answer in the history.
- **The tutor panel's position is kept in `localStorage`** (a per-browser convenience; the app works
  the same without it). The panel can also be moved with the arrow keys.
- **The tutor sits out Rebuild mode.** It can see the original code, so it could give the answer
  away. The original of the current level opens (read-only) only after a review.
- **Specs never quote the original**: any original line of 30+ characters found in the spec's text
  sends it back for one retry with the reason, then fails. Shorter lines (`res.json(todos);`) are
  too generic to count as copying.
- **Review citations are kept only when they point at a real original file**, so the learner never
  clicks through to a file that does not exist.
- **Learning events store summaries** (level, pass counts, concepts), never code.

### Phase 9: learner profile

- **Two ways the profile moves.** Results that already carry a score (rebuild reviews:
  solid/shaky/missed; quiz answers: right/wrong) update mastery straight away with fixed steps, so
  the profile works even when no AI provider is ready. Chat questions carry no score, so they are
  batched (6 at a time, or on "Learn from my last questions") and `profile_update` on the fast model
  decides what they mean and writes a note for each change.
- **First sighting sets a starting point** (solid 0.7, shaky 0.4, missed 0.15; quiz right 0.6,
  wrong 0.25), later results move it by a step, and mastery always stays between 0 and 1.
- **Background work uses `after()`**, so the learner never waits on a profile update; outside a
  Next.js request (tests, scripts) the job just runs unawaited.

### Phases 10 and 11: Tier 2

- **One `report` table** (migration 0001) keeps the full lessons-and-gaps report for display. The
  reusable checklist lives in `checklist_item`, deduplicated by title, so it grows across projects
  without repeats.
- **Code for whole-project tasks is packed by layer** (security, backend, database first) into a
  line budget; files that do not fit are sent as outlines. Audit findings are kept only for files
  that were actually sent, and line numbers past the end of a file are dropped.
- **Quiz answers never reach the browser before the learner answers**: the quiz view has no
  `correctAnswer` or `explanation` for unanswered questions. Multiple choice is marked on the
  server without AI (the model must make the answer exactly one of the options; checked, with one
  retry); free-text answers go to `quiz_grade` on the fast model, with the answer wrapped in an
  `<answer>` tag so it cannot instruct the grader.
- **Remix hints are released one at a time** by the server; the challenge view only includes hints
  already asked for. Submitting the untouched skeleton is refused.
- **Quiz and remix difficulty follow the profile**: the average mastery picks gentle, medium or
  challenging wording in the prompt.
- **Audit mode and Quiz mode keep the tutor**; Rebuild mode does not (see above). Links from audit
  findings and tutor replies open the file in Tour mode at that line (`?path=` and `?line=`).

### One-click start (Windows)

- (Replaced by the desktop app in plan-next part 3.) **The desktop shortcut ran `scripts/start-retrace.ps1`** in production mode (`next start`), which
  is much faster than dev mode. It installs dependencies on the first run and rebuilds only when a
  file under `src/` or a config file is newer than the last build; prompts and migrations are read
  at runtime, so editing them needs no rebuild.
- **`-ExecutionPolicy Bypass` is passed on the shortcut for that one script**, so the learner's
  PowerShell execution policy is never changed.
- **Closing the window stops Retrace.** The server shares the window's console, so nothing keeps
  running in the background after the learner is done.
- **The icon is drawn by a script** (`scripts/make-icon.mjs`, plain Node and zlib), so it can be
  changed without an image editor or an extra dependency.

### Terminal look

- **The whole UI is monospace and styled like a terminal** on a neutral grey dark background (no
  CRT effects): a title bar with tmux-style tabs, a
  prompt line that doubles as the breadcrumb, `[ bracket ]` buttons, `##` section headings, a
  braille spinner and block progress bars. Colours are the icon's syntax colours, and every text
  colour still meets WCAG AA on its background.
- **No font dependency.** The stack starts with Cascadia Code, which ships with Windows 11, and
  falls back to the usual terminal fonts elsewhere, so nothing is downloaded at build time.
- **The status-bar command line only navigates** (`ls`, `cd`, `open`, `remix`, `progress`,
  `settings`, `back`, `pwd`, `clear`). It never runs code, calls the tutor or changes data, and its
  parser is a pure function with its own tests (`src/lib/commands.ts`).
- **Monaco gets a matching theme** (`retrace-terminal`, defined in `CodeViewer`), so the editor
  and the rest of the screen share one background and palette.

### Token savings (plan-next part 1)

- **Token counts are stored per call** (`ai_usage`: task, provider, model, four counts, time).
  No prompt, code or reply text, so the table is safe to keep.
- **Only chat and lessons are marked for caching.** One-shot JSON tasks are not: writing to the
  cache costs extra and nothing would read it back.
- **A saved lesson is reused** unless the learner presses "regenerate".
- **Economy mode** moves every task to the fast model; one helper (`ai/models.ts`) picks the model
  for every call site.

### Redesign (plan-next part 2)

- **Ink blue-black instead of neutral grey**, with colour by role: each pane, tab and step sets
  `--c`, and primary buttons and focused borders use it. Green stays for "done" and the tutor.
  Contrast was checked for every text colour on every surface (lowest 5.1:1).
- **Titled cards become panes in CSS** (`.card > h2:first-child`), so every screen got the TUI
  look without rewriting each component.
- **Ctrl K opens a command list** built on the same commands as the `:` line; it does not animate,
  because it is opened from the keyboard many times a day.

### Desktop app (plan-next part 3)

- `electron`: the desktop shell; it ships Node, which the server needs for SQLite and the Agent SDK's Claude Code binary.
- `electron-builder`: builds the Windows installer (NSIS, wizard mode, per-user so no admin prompt).
- `esbuild`: bundles `electron/main.ts` and `preload.ts` into single files, so the app package needs no `node_modules` (it was already installed through Vite; now listed directly).
- **The server runs as Electron's own binary in Node mode** (`ELECTRON_RUN_AS_NODE`) from the
  Next standalone output, kept outside the app archive in `resources/server`.
- **better-sqlite3 needs no rebuild**: its prebuilt files use Node-API, which works in Electron.
- **A fresh secret per launch** is required on every request (a cookie set only on the app's own
  window), so other programs on the PC cannot use the local server.
- **Standalone output only for the desktop build** (`RETRACE_DESKTOP_BUILD=1`), so `npm start`
  keeps working as before.

### Automatic updates (plan-next part 4)

- `electron-updater`: downloads and installs new versions from GitHub Releases; made for electron-builder's NSIS installers, so no update server of our own.
- **The bridge exposes three things, not two:** update state, "install now", and "check now"
  (the Settings button). Nothing else from the computer reaches the page, and the main process
  only answers requests from the app's own origin.
- **The repository is named in `package.json`** (`build.publish`: `Lymion/retrace`), since it is
  public anyway and every build should find updates; `RETRACE_GH_OWNER` / `RETRACE_GH_REPO` in the
  shell override it for a fork. The upload token never leaves the shell: `GH_TOKEN` if set, else
  `gh auth token`, handed only to the build process.
- **The database is copied before a new version's first launch** (`retrace.db.bak-<old version>`),
  before migrations run.
