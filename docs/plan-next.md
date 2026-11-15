# Retrace: next three pieces of work

Written 2026-11-16. Nothing here is built yet. Suggested order: tokens, then the redesign, then the desktop app, so the installer ships the final UI.

## 1. Use fewer tokens

This is about the tokens Retrace spends when the tutor answers, not about Claude Code sessions.

### What the code does today

| Finding | Where |
| --- | --- |
| Only the project fact sheet is marked for caching. It is about a page long, which is probably under the API's minimum cacheable size, so the cache may never be hit. | `src/server/ai/providers/api-key.ts` |
| The big, stable content (the open file, a level's files) sits after the task instructions and is never cached. | `src/server/ai/context.ts` `buildTutorRequest` |
| Every chat turn resends the open file (up to 600 lines) plus the last 10 messages. Those 10 include whole lessons, each up to 3,500 tokens. | `context.ts` `recentMessages`, `tasks/tutor.ts` |
| Asking for a level's lesson again generates it again, although the first one is saved. | `api/projects/[id]/levels/[levelId]/lesson/route.ts` |
| Roadmap, quiz writing, alternatives, gaps, audit and remix all run on the larger model with output caps of 3,000 to 8,000 tokens. | `tasks/*.ts` |
| Nothing records what a call cost, so none of the above is measured. | whole AI layer |

### Steps

1. **Measure first.** Add an `ai_usage` table (task, provider, model, input, output, cache-read and cache-write token counts, time). Both providers report these numbers. No code or prompt text is stored. Show today's total in the status line and a per-task table in Settings.
2. **Reorder requests so the stable part comes first.** System prompt, fact sheet, level block and file contents first, with the cache marker after them. Instructions, learner profile and outside notes after the marker. In chat, add a second marker on the last earlier message so each turn reuses the one before.
3. **Trim chat history.** Budget history by size instead of by count. Replace an earlier lesson with its title and first paragraph. Send the open file once per file, not on every turn, unless the selection changed.
4. **Reuse saved work.** Serve the saved lesson for a level and depth; generate again only on an explicit "regenerate". Check spec, quiz, audit, alternatives and gaps for the same pattern.
5. **Right-size models and output.** Move quiz writing and the audit's first pass to the fast model. Add an "economy" switch in Settings that also runs lessons and chat on the fast model. Tie output caps to the depth setting.
6. **Send less code.** Lower the lesson budget from 1,500 lines to about 800 and rely on outlines for the rest. Audit only the security, backend, database and config layers in full.
7. **Fewer retries.** On the API key, use structured output for JSON tasks so the "wrong shape, ask again" second call mostly disappears.

Steps 2 to 4 should give the largest saving. I will not put a percentage on it until step 1 has real numbers from one project.

All brief rules stay as they are: redaction before any call, code inside `<file>` tags, no code in logs, no tools in Claude-login mode.

## 2. Redesign, same theme

Test design to comment on: https://claude.ai/artifact/PQXuD9Drydqcv5uYCxWadm

The grey terminal look, monospace, bracket buttons, `##` headings, block progress bars and the status line all stay. What changes is the organisation.

| Before | After | Why |
| --- | --- | --- |
| Home opens on a banner, a status list and the upload box | One resume card with one primary button; projects below; upload last | The next thing to do is the largest thing on screen |
| Decorative macOS dots | Real window controls; the top bar drags the window | It becomes the real title bar (see part 3) |
| Commands only through the `:` line | A visible "go to or run" button and Ctrl K list; `:` still works | Discoverable without reading help |
| Tour, rebuild, quiz, audit as equal tabs | Numbered steps and a next-step bar under the content | The order is real |
| Level map on its own screen | Level rail beside the lesson | Position stays visible |
| 12px labels, full-width lessons | 14px base, 68-character lessons, optional sans for lesson text | Easier long reading |
| No cost shown | Token estimate beside AI buttons, total in the status line | Uses the numbers from part 1 |
| Hover colour only | 0.97 press scale at 140ms; nothing animates on keyboard actions | Feedback without slowing shortcuts |

Background colour: the neutral grey (`#1e1e1e`) becomes a deep ink blue-black (`#0f1117`, surfaces `#151821` and `#1d212c`, borders `#2a2f3c`), with text greys shifted slightly cool to match. The syntax colours stay as they are. The Monaco theme and the app icon follow the same values.

Colour by role: green stops being the one accent. Each pane, tab and step takes its own syntax colour (blue, purple, orange, cyan, yellow, red), primary buttons take their pane's colour, and progress bars run a purple-to-green gradient. Green is kept for "done" and for the tutor.

Passes, one commit each, checked in the running app after each:

1. Hierarchy: home, workspace layout, level rail, next-step bar.
2. Feedback: press states, loading skeletons in the block-bar style, streaming cursor, reduced-motion rules.
3. Tokens: type scale (12, 14, 16, 19), spacing scale, one easing curve, in `globals.css`.
4. Content: fold the fact sheet, redaction list and analysis overview into collapsed sections.
5. Navigation: command list, and settings moved to the right of the bar.
6. Accessibility check: contrast, focus rings, keyboard path through every screen.

A skill named `review-prototype` is not installed here, so the test design is a published page you can comment on directly.

## 3. Desktop app with an installer

**Electron with electron-builder (NSIS).** Retrace's server needs Node (SQLite, the Claude Agent SDK's bundled CLI), and Electron ships Node. Tauri would need a separate Node runtime bundled beside it.

1. `next.config.ts`: `output: "standalone"`.
2. `electron/main.ts`: take the single-instance lock, start the standalone server as a child on `127.0.0.1` with a free port, wait for `/api/health`, open one window on it. Quit stops the server.
3. Window security: context isolation on, no Node in the page, navigation locked to the local address, outside links open in the default browser. A random per-launch secret is required on every API request, so other programs on the PC cannot call the server.
4. Data moves to `%APPDATA%\Retrace` (`RETRACE_DATA_DIR`), including the database and `.env`. Settings gets an "open data folder" button. First launch offers to copy the existing `data/` folder.
5. Native parts: rebuild `better-sqlite3` for Electron, and keep it and the Agent SDK's CLI binary outside the packed archive so they can run.
6. Title bar: hidden native bar with the Windows control overlay, so the terminal top bar is the title bar.
7. Installer: NSIS in wizard mode (not one-click): choose folder, Start menu entry, optional desktop shortcut, uninstaller in Windows Settings. The icon comes from `scripts/make-icon.mjs`.
8. Remove `start-retrace.ps1` and `create-shortcut.ps1` once the installer works. `npm run dev` stays for development.
9. `docs/decisions.md`: one line each for `electron` and `electron-builder`.

Things to know before choosing this:

- The installer will be large, roughly 200 to 300 MB, mostly Electron and the Agent SDK binary.
- It will be unsigned, so Windows SmartScreen shows a warning on install. A signing certificate costs money each year.
- Updates are covered in part 4.
- Claude-login mode stays personal-use only. An installer shared with other people must use the API key.

## 4. Automatic updates

Goal: a line appears under the title bar when a new version is ready; one click installs it and reopens the app. The test design shows this line.

**`electron-updater` with GitHub Releases.** It is the updater made for electron-builder's NSIS installers and needs no server of our own.

How it works for you:

1. On launch, and every few hours while open, the app asks GitHub whether a newer version exists.
2. If so, it downloads it in the background. Only the changed parts are fetched, so most updates are far smaller than the installer.
3. When the download is complete and verified, the update line appears: `update · retrace 0.2.0 is ready · [ restart and update ] [ later ]`.
4. One click: the local server stops, the installer runs silently, the app reopens on the new version. "Later" installs it the next time you quit.
5. The status line shows the running version. Settings gets "check now" and a switch to turn automatic checks off.

Build steps:

1. Install per user, not per machine, so updates need no administrator prompt.
2. `electron/updater.ts` in the main process: check, download, and report state (`checking`, `downloading 40%`, `ready`, `error`).
3. `electron/preload.ts`: expose only two things to the page, "tell me the update state" and "install now". The page gets no other access.
4. `UpdateBanner` component in the top bar area, hidden when not running in the desktop app.
5. Before the first launch of a new version runs database migrations, copy `retrace.db` to `retrace.db.bak-<old version>`.
6. `npm run release`: bump the version, build, and upload the installer and its update files to a GitHub release. The upload token lives only in your shell, never in the app.
7. Test for real: install 0.1.0, publish 0.1.1, confirm the line appears and one click lands on 0.1.1 with projects intact.

Decisions and limits:

- **Where releases live.** Decided: a public GitHub repository. The updater reads its releases without a login. Before the repository goes public, check that `.env`, `data/` and any real keys were never committed.
- **Trust.** Each download is checked against a hash from the release, over HTTPS. Without a code-signing certificate the app cannot also check who built it, so anyone who can publish to that repository can ship code to your PC. Keep two-factor sign-in on the GitHub account.
- **New outbound request.** Today the app only talks to Anthropic and, on request, GitHub. Update checks add a regular request to GitHub that sends nothing about your projects. The README and Settings will say so.
- Offline or a failed download: nothing is shown, and it retries at the next check.
- `docs/decisions.md`: one line for `electron-updater`.
