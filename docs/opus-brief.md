# Brief: finish the Retrace plan (tokens, redesign, desktop app, auto-update)

You are picking up work on **Retrace**, in `C:\Users\sadzw\dev\apps\codehelper`. Read this whole brief before touching anything. It is written so you need nothing from the earlier conversation.

## What Retrace is

A local, single-user learning app. The learner uploads a project they already finished (zip or GitHub link). Retrace works out the order it was built in, splits it into levels, and teaches it back: a tour lesson per level, line annotations, a tutor chat, rebuild-from-spec with review, quizzes, a security audit, alternatives, gaps, remix challenges and a progress dashboard. All of that is built and working.

- Stack: Next.js 16.4 (App Router, Turbopack), React 19, Tailwind 4, TypeScript 5.9 strict, SQLite through better-sqlite3 and Drizzle, Monaco served from `/public/monaco`, Zod 4, Vitest.
- AI: one `AIProvider` interface with two providers. `api-key` uses the Anthropic SDK with `ANTHROPIC_API_KEY` from `.env`. `claude-login` uses the Claude Agent SDK with the learner's own Claude login, locked down to no tools and one turn.
- The owner is a learner, not a professional developer. Write to them in plain language and explain anything they must do by hand.

Read these first: `CLAUDE.md`, `AGENTS.md`, `README.md`, `docs/decisions.md`, `docs/plan-next.md` (the plan this brief implements), and `docs/design/retrace-redesign.html` (the approved test design; open it in a browser and click through it).

`AGENTS.md` warns that this Next.js version differs from what you may remember. Before writing Next-specific code, read the relevant guide under `node_modules/next/dist/docs/`.

## Rules that never bend

These come from the owner's original brief. Every part below must keep them true, and you should add or keep tests that prove it.

- Never execute uploaded code, run its scripts, or install its dependencies.
- Redact secrets before storing and before any API call (API keys, tokens, private keys, `.env` values), and show the learner what was redacted.
- Delete the uploaded or downloaded zip after extraction.
- GitHub links: accept only `https://github.com/<owner>/<repo>` URLs. Never fetch a URL the user typed directly.
- `GITHUB_TOKEN` stays server-side, goes only to GitHub, is never logged and never put in a prompt.
- Never mix credentials. In claude-login mode, `ANTHROPIC_API_KEY` is removed from the child process environment. Never read, copy or store the Claude login token.
- claude-login stays locked down: all tools disabled, a single turn, an empty temp folder as the working directory.
- Subscription login is for the learner's own use on their own computer. A shared or hosted version must use api-key only. The README and Settings say this; keep it.
- Bind to localhost only.
- The Anthropic API key stays server-side, loaded from `.env`. Commit `.env.example`, never the real file.
- Log events and errors without logging code content.
- Justify each new dependency in one line in `docs/decisions.md`.

`samples/*/.env` are deliberate fake values for the sample projects. Leave them.

## How to work

- Do the four parts in order: tokens, redesign, desktop app, auto-update. The installer should ship the final UI.
- One commit per part at minimum, on the existing branch `plan-next`. Do not push, open a pull request, publish a release, or change the GitHub repository's visibility without asking the owner first.
- After each part, run `npm run typecheck`, `npm run lint` and `npm test`, and fix what breaks. There were 257 passing tests before this work began. Update a test only when the behaviour it checks changed on purpose, and say which ones you changed.
- For anything visible, run the app (`npm run dev`, http://127.0.0.1:3000) and look at it. Check each screen at desktop width and at about 400px. Report what you saw, not what you expect.
- Report honestly at the end of each part: what works, what you could not test (for example, live API calls if no key is set), and anything you left out and why.
- The machine is Windows 11 with PowerShell and Git Bash. Shell heredocs containing quotes have failed here; write files with your file tools or a short Python script instead.
- If a decision is truly the owner's (money, publishing, anything irreversible), stop and ask. Otherwise choose the sensible option, say what you chose, and continue.

## State of the branch right now

Branch `plan-next` has **uncommitted, untested** work from an interrupted session. Review it with `git status` and `git diff` before continuing. Keep it if it is sound; fix or redo it if not.

What exists:

- `src/db/schema.ts`: a new `aiUsage` table (`ai_usage`): task, provider, model, input, output, cache-read and cache-write token counts, created time. Migration `drizzle/0002_*.sql` was generated.
- `src/server/ai/usage.ts` (new): `UsageReport`, `toReport`, `recordUsage`, `usageSummary` (today, last 7 days, by task) and `cachedPercent`.
- `src/server/ai/provider.ts`: `AIRequest` gained `stableContext` (the level and code under discussion, which repeats between turns) and `cache` (a hint that another request with the same start is likely). `systemParts` now returns system, fact sheet, stable context, context.
- `src/server/ai/providers/api-key.ts`: `buildParams` rewritten and exported. It puts the cache marker on the last repeating system block and, when `cache` is set, on the last earlier chat message. Both `complete` and `stream` report usage through a new `onUsage` dependency.
- `src/server/ai/providers/claude-login.ts`: reports usage from the result message through `onUsage`.
- `src/server/ai/registry.ts`: passes `onUsage: recordUsage` to both providers.
- `docs/plan-next.md`, `docs/design/retrace-redesign.html`, and this file: new, uncommitted.

Nothing yet sets `stableContext` or `cache`, so behaviour is unchanged so far apart from usage rows being written.

## Part 1: use fewer tokens

Goal: the same teaching for clearly fewer tokens, with numbers the learner can see.

Findings that motivate this (verify them in the code):

- Only the one-page project fact sheet was marked for caching. It is probably below the API's minimum cacheable size, so the cache may never have been hit.
- `buildTutorRequest` in `src/server/ai/context.ts` puts task instructions before the code, so the large stable part was never a reusable prefix.
- Every chat turn resends the open file (up to 600 lines) and the last 10 messages. `recentMessages` includes whole lessons, each up to 3,500 tokens.
- `src/app/api/projects/[id]/levels/[levelId]/lesson/route.ts` generates a new lesson every time, although each lesson is saved as a `lesson` message.
- Roadmap, quiz writing, alternatives, gaps, audit and remix all run on the larger model with output caps of 3,000 to 8,000 tokens.

Do this:

1. **Finish usage recording.** Confirm rows are written for both providers, for streamed and non-streamed calls, including a stream the learner stops early. Add `GET /api/usage` returning `usageSummary`. Show today's total and cached share in the status line, and a per-task table for the last 7 days in Settings. Add tests for `toReport`, `recordUsage`, `usageSummary` and the API-key usage reporting.
2. **Use the cache-friendly order for chat and lessons.** In `buildTutorRequest`, when a new `cache` input is true, put the level block, the open file and any task-supplied stable blocks into `stableContext`, and keep instructions, learner profile and outside notes in `context`. Set it for `prepareChat` and `prepareLesson` only. For the lesson, move the level's files out of the `teach_level` prompt template into the stable part, and change the template's wording from "given below" to "given above". Leave one-shot JSON tasks as they are: marking their input for caching costs 25% more to write and is never read back.
3. **Trim chat history.** In `recentMessages`, keep at most 10 messages but also cap the total size (about 6,000 characters). Replace each earlier lesson with its first heading and first paragraph plus a note that it was shortened. Cap any single earlier chat message at about 1,500 characters.
4. **Reuse saved lessons.** The lesson route returns the saved lesson for that level unless the request body says `regenerate: true`. A reused lesson costs no model call and is not saved again. Add a small "regenerate" control beside the tour button in `src/features/tutor/TutorPanel.tsx`. Then check spec, quiz, audit, alternatives and gaps for the same pattern and fix any that regenerate without being asked.
5. **Economy mode.** Add a boolean setting `economyMode` (default off) in `src/server/settings.ts`, the settings API and `SettingsForm`. When on, every task uses the fast model. Add one helper that resolves the model for a task and use it at every call site instead of reading `settings.tutorModel` directly.
6. **Output caps by depth.** The depth setting is `beginner`, `intermediate` or `advanced`. Scale the lesson and chat output caps with it, keeping today's values as the maximum.
7. **Send less code.** Lower `LESSON_LINE_BUDGET` in `tasks/tutor.ts` from 1,500 to about 800; files over budget already fall back to outlines. In `code-bundle.ts`, add an option so the project-wide audit sends only the security, backend, database and config layers in full and outlines the rest.
8. **Structured output (only if you can test it).** For the API-key provider, JSON tasks could use the API's structured output so the validate-and-retry second call mostly disappears. Structured output restricts which schema features are allowed, and a rejected schema would break a task outright. Do this only if a real key is available to run each JSON task once. Otherwise leave it out and say so.

Done when: checks pass, usage shows in the status line and Settings after a real or faked call, a second chat turn on the same file reports cache-read tokens when run against the real API (or you state clearly that this could not be run), and asking for the same lesson twice makes one model call.

## Part 2: redesign in the terminal theme

The approved look is `docs/design/retrace-redesign.html`. Treat it as the specification for layout, colour and tone. It is a static mock with example data; build the real thing with the app's real data and components. Keep all functionality and data exactly the same; this part changes design only.

**Colour.** Replace the neutral grey with a deep ink blue-black. In `src/app/globals.css`:

| Token | Value |
| --- | --- |
| `--bg` | `#0f1117` |
| `--surface` | `#151821` |
| `--surface-2` | `#1d212c` |
| `--border` | `#2a2f3c` |
| new `--rule` (pane borders) | `#3b4252` |
| `--text` | `#d0d5de` |
| `--bright` | `#f2f4f8` |
| `--muted` | `#a7aebb` |
| `--comment` | `#8a92a2` |
| code block background | `#0a0c11` |

Syntax colours stay: green `#7ee787`, blue `#79c0ff`, purple `#d2a8ff`, orange `#ffa657`, yellow `#e3b341`, red `#ff7b72`, cyan `#56d4dd`. Update the Monaco `retrace-terminal` theme in `CodeViewer.tsx` and the icon script `scripts/make-icon.mjs` to match. Every text colour must keep at least 4.5:1 contrast on every surface it sits on; check, do not assume.

**Colour by role.** Green is no longer the one accent. Each pane, tab and step has its own syntax colour, primary buttons take the colour of the pane they sit in, and progress bars run a purple-to-blue-to-cyan-to-green gradient (red to yellow for weak concepts). Green is kept for "done" marks and the tutor. Follow the assignments in the test design.

**Terminal structure.**

- Square corners throughout. Panes are boxes with the title set into the top border (`┤ title ├`) and an optional note at the top right. The pane with focus has its border in its role colour.
- Top bar: gradient `❯ retrace` name, tmux-style tabs (`0:projects*`, the active one inverted in its colour), a visible "run" button showing `Ctrl K`. Remove the decorative macOS dots; Part 3 puts real window controls there.
- Home: a `❯ retrace --start` prompt line, the block-letter RETRACE logo from the test design with its gradient, a level trail line for the most recent project, then a "resume" pane as the one focal action (project, level, progress, one primary button, and what it will cost in tokens), then an `ls -l` style project listing where the hovered or focused row inverts, then an "add a project" pane with the zip button and a `url ❯` field. If there are no projects, the add pane is the focal action instead.
- Workspace: three panes. Levels as a tree with branch lines and status marks (done, current, not started, skipped). The lesson pane with numbered steps `1:tour 2:rebuild 3:quiz 4:audit`, a `#` heading, code with line numbers, and a next-step bar at the bottom naming the next action, its estimated token cost and one primary button. The tutor pane as a session log: `you ❯` and `tutor ❯` lines, `@` context tags, a prompt with a blinking block cursor. Keep the tutor panel's existing dock, float, drag and collapse behaviour.
- Progress: a key-and-value summary pane (levels, quiz average, concepts, tokens this week from Part 1), concepts weakest first with block bars, and the open checklist.
- A key-hint row above the status line, and a segmented status line: mode, current place, path, the command line, today's tokens and cached share, the version, the clock.
- Command list on `Ctrl K`: a centred list with a filter, arrow keys, Enter and Escape, built on the existing commands in `src/lib/commands.ts`. The `:` command line keeps working. In the workspace, `j`/`k` move between levels and `1` to `4` switch steps, but never while the learner is typing in an input, textarea or the editor.

**Type and reading.** Base size 14px; nothing below 12px. Lesson text at most 68 characters wide with 1.7 line height. Add a setting for lesson text: monospace (default) or sans.

**Motion.** Buttons scale to 0.97 on press over about 140ms with a strong ease-out (`cubic-bezier(0.23, 1, 0.32, 1)`). Nothing that opens from the keyboard animates, including the command list. Only animate transform and opacity. Honour `prefers-reduced-motion` for the press scale, cursor blink and spinner. No bounce.

**States.** Every screen keeps a designed empty, loading and error state in the same style: loading as block-bar skeletons or the braille spinner, errors next to what failed with a way to retry.

**Accessibility.** Visible focus on every control, a keyboard path through every screen, decorative characters (brackets, tree lines, prompts, the logo) hidden from screen readers, and real labels on inputs.

Work in passes and look at the running app after each: tokens and shell; home; workspace; progress and settings; command list and keys; accessibility and narrow-width check. Keep or update the tests in `src/lib/commands.test.ts`.

Done when: every screen matches the test design's structure and colour, all features still work end to end on a sample project, and the checks pass.

## Part 3: desktop app with an install wizard

Goal: Retrace installs from a setup wizard, appears in the Start menu, can be pinned, and opens in its own window with no browser and no console window.

Use **Electron with electron-builder (NSIS)**. The server needs Node for SQLite and for the Agent SDK's bundled CLI, and Electron ships Node.

1. `next.config.ts`: add `output: "standalone"`. Confirm the standalone server still serves `/public/monaco` and static assets (they must be copied beside it) and that `prompts/` and `drizzle/` are found at runtime. `src/server/ai/prompts.ts` reads prompts from `process.cwd()`; make that work when packaged.
2. `electron/main.ts`: take the single-instance lock (a second launch focuses the existing window). Pick a free port, start the standalone server as a child process bound to `127.0.0.1`, wait for `/api/health`, then open one window on it. Stop the server when the app quits. Show a plain error window if the server fails to start.
3. Window security: context isolation on, sandbox on, no Node integration, navigation locked to the local address, new windows denied, outside links opened in the default browser. Generate a random secret at each launch, pass it to the server and require it on every `/api/*` request, so other programs on the PC cannot call the server. The existing content security policy in `src/proxy.ts` must still pass.
4. Data location: set `RETRACE_DATA_DIR` to a `Retrace` folder under the user's app-data directory. The database, temp folder and `.env` live there. Settings gets an "open data folder" button. On first launch, if the old `data/` folder is found beside the repository, offer to copy it; never delete the original.
5. Native parts: rebuild `better-sqlite3` for Electron, and keep it and the Agent SDK's CLI binary unpacked (outside the archive) so they can load and run. Verify the claude-login provider still starts its child process from the packaged app, and that the child still gets no `ANTHROPIC_API_KEY`.
6. Title bar: hide the native bar and use the window-controls overlay, so the terminal top bar is the title bar. Mark the bar as the drag region and its buttons as not draggable.
7. Installer: NSIS in wizard mode (`oneClick: false`), per-user install so no administrator prompt is needed, a choosable folder, a Start menu entry, an optional desktop shortcut and an uninstaller. Set a stable app id so pinning survives updates. Generate the `.ico` from `scripts/make-icon.mjs`.
8. Scripts: `npm run desktop:dev` (Electron against the dev server) and `npm run dist` (build the installer). `npm run dev` keeps working in a browser for development.
9. Once the installer works, remove `scripts/start-retrace.ps1`, `scripts/create-shortcut.ps1` and the `shortcut` script, and update the README. The old desktop shortcut points at `C:\CodeHelper`, which no longer exists; tell the owner to delete it.
10. `docs/decisions.md`: one line each for every new dependency.

Tell the owner plainly: the installer will be large (my estimate is 200 to 300 MB; measure it and report the real size), and it is unsigned, so Windows SmartScreen shows a warning on first install. A signing certificate costs money each year and is their choice.

Done when: `npm run dist` produces a setup `.exe`; you have installed it, launched it from the Start menu, uploaded a sample project, opened a lesson, closed and reopened the app with data intact, and uninstalled it. If you cannot run the installer yourself, say exactly which of these you could not check.

## Part 4: automatic updates

Goal: when a new version exists, a line appears under the title bar; one click installs it and reopens the app. The test design shows this line and its states.

Use **`electron-updater` with GitHub Releases** on a **public repository** (the owner chose public).

1. `electron/updater.ts` in the main process: check on launch and every few hours, download in the background, and report state (`idle`, `checking`, `downloading` with a percentage, `ready` with the version, `error`). Offline or a failed download shows nothing and retries at the next check.
2. `electron/preload.ts`: expose exactly two things to the page through the context bridge: subscribe to update state, and install now. Nothing else.
3. `UpdateBanner` component under the top bar: `update · retrace X is downloaded and ready · [ restart and update ] [ later ]`. It renders nothing in a plain browser. On click: show the installing state, stop the local server cleanly, run the installer silently and relaunch. "Later" hides the line and the update installs on the next quit.
4. Before the first launch of a new version applies database migrations, copy the database file to `retrace.db.bak-<old version>` in the data folder.
5. Settings: the running version, a "check now" button, and a switch to turn automatic checks off. The status line shows the version.
6. `npm run release`: bump the version, build, and upload the installer and its update files to a GitHub release. The upload token is read from the owner's shell environment only. It must never be committed, bundled into the app, or logged.
7. README and Settings: say that the desktop app contacts GitHub to check for updates, that the request carries nothing about the learner's projects, and how to turn it off.
8. `docs/decisions.md`: one line for `electron-updater`.

Before anything is published, stop and ask the owner for:

- the GitHub owner and repository name to publish to;
- confirmation to make the repository public. First check the full git history for anything that must not be public (a real `.env`, the `data/` folder, real keys or tokens) and report what you find;
- confirmation for each release upload.

Tell the owner plainly: downloads are checked against a hash from the release over HTTPS, but without a signing certificate the app cannot check who built an update. Anyone who can publish to that repository can ship code to their PC, so two-factor sign-in on the GitHub account matters.

Done when: the banner, its states and the settings controls work against a simulated update; and, once the owner has approved publishing, a real test passes: install version A, publish version B, see the line appear, click once, and land on version B with projects and progress intact. If the real test has not happened, say so.

## What to hand back

After each part, a short plain-language report for the owner:

1. What they can now do that they could not before.
2. What you tested and how, and what you could not test.
3. Anything you changed from this brief, and why.
4. Anything they need to do by hand, step by step.
