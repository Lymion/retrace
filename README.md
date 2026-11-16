# Retrace

Learn app development by rebuilding your own finished projects, level by level.

Upload a project you built (a zip or a GitHub link). Retrace works out the order a developer would
have built it in, from the idea to shipping, and turns that into **levels**. For each level you can:

- **Tour** it with a tutor that teaches from your actual code, with line-by-line notes in the editor
- **Rebuild** it yourself from a spec (no original code), then get a review against the original
- **Quiz** yourself on it, and **audit** it for security problems
- See **design alternatives**, **lessons and gaps**, and take **remix challenges** in a new domain

It runs on your own computer (localhost only, one user, no accounts).

---

## 1. Install

You need **Node.js 22 or newer** (`node -v`) and npm.

```bash
git clone <this repo> retrace
cd retrace
npm install
```

`npm install` also copies the code editor (Monaco) into `public/monaco`, so nothing loads from a CDN.

Create your settings file:

```bash
cp .env.example .env
```

On Windows PowerShell use `Copy-Item .env.example .env`.

## 2. Choose an AI provider

Retrace's tutor runs on Claude. Pick **one** of these (you can switch any time in **Settings**):

| Provider     | What you need                                                       | Billing                         |
| ------------ | ------------------------------------------------------------------- | ------------------------------- |
| API key      | `ANTHROPIC_API_KEY=...` in `.env`, then restart Retrace             | Per token, on the Anthropic API |
| Claude login | Claude Code signed in with your own Claude account on this computer | Your Claude plan's usage limits |

**To sign in for Claude login**, run this once in a terminal, type `/login`, and follow the steps:

```bash
npx @anthropic-ai/claude-code
```

Then open **Settings** in Retrace and press **Check again**. Settings shows each provider's status
and a one-line fix when it is not ready.

> **Personal use only.** Claude login is for your own use on your own computer. Anthropic does not
> allow third-party apps to offer Claude login to other people, and its rules on this changed more
> than once in 2026. A shared or hosted copy of Retrace must use the API key provider only.

When Retrace uses Claude login it runs Claude Code with **no tools at all**, one turn, an empty temp
folder and no API key in its environment, so uploaded code can never make it read or run anything.

## 3. Run it

### One click (Windows)

Create a **Retrace** shortcut on your desktop once:

```bash
npm run shortcut
```

Double-click it whenever you want to study. It opens a small window, builds Retrace if the code
changed since last time (a minute or two), starts it, and opens **http://127.0.0.1:3000** in your
browser. Keep that window open while you use Retrace; close it to stop. Double-clicking again while
Retrace is running just opens the browser. Run `npm run shortcut` again if you move the folder.

### From a terminal

```bash
npm run build
```

```bash
npm start
```

Or `npm run dev` while changing Retrace's own code (slower, reloads on save). Either way, open
**http://127.0.0.1:3000**. The database (`data/retrace.db`) is created on first start.

## Desktop app (Windows)

You can also install Retrace as a normal Windows app with its own window, Start menu entry and
uninstaller.

```bash
npm run dist
```

This builds `release/Retrace-Setup-<version>.exe`. Run it, choose a folder (or keep the default),
and tick "Create a desktop shortcut" on the last page if you want one. Then open **Retrace** from
the Start menu and pin it if you like.

- **Size:** about 260 MB to download and about 780 MB installed, mostly the Claude Code program
  the Claude login needs.
- **Windows warning:** the installer is not signed, so SmartScreen says "Windows protected your
  PC". Click **More info**, then **Run anyway**. Signing removes this but needs a paid
  certificate.
- **Your data** lives in `%APPDATA%\Retrace` (database and `.env`). Settings has an "open data
  folder" button. On first launch the app offers to copy projects from an older `data/` folder;
  the original is never changed.
- **API key:** put `ANTHROPIC_API_KEY=...` in `%APPDATA%\Retrace\.env`, then restart the app.
- **Personal use only** applies here too: an installer you give to other people must use the API
  key, never your Claude login.
- `npm run desktop:dev` opens the app window against `npm run dev`, for development.

## 4. Your first tour (about 10 minutes)

1. Build the two sample projects into zips:

   ```bash
   npm run samples:zip
   ```

2. On the **Projects** page, drop `samples/todo-express-react.zip` into the upload box. You see the
   project summary, the files, and a list of **secrets that were removed** (the sample has a fake
   `.env` and a hard-coded JWT secret on purpose).
3. Press **Build the roadmap**. The tutor reads the file list, the imports, the README and the git
   history (paths and dates only) and returns about 12 levels. Levels the project skipped (testing,
   security hardening...) are marked, and you can still learn them.
4. Press **Open in workspace** on **Level 3: Backend core**.
5. In **Tour** mode, open `server/routes/todos.js`. Coloured dots in the gutter are notes: click one
   (or use the notes list under the editor). Then press **Tour this level** in the tutor panel for a
   six-part lesson. Ask follow-up questions in English, Malay or both. Select some lines and press
   **Explain this selection**.
6. When you have checked the level's checkpoint, press **I passed the checkpoint**.
7. Switch to **Rebuild**, press **Get the spec**, write the files, and **Submit for review**.
8. Try **Quiz** and **Audit** for the same level, and the **Remix challenge** from the project page.
9. **Progress** shows your levels, concept mastery, quiz scores and your new-app checklist.

**Getting around by command.** The bar at the bottom of the window is a command line. Press `:`
(or Ctrl+K) from anywhere, type `help`, and try `ls`, `cd flask-notes`, `open`, `remix`, `cd ..`,
`progress` or `settings`. Tab completes command and project names, and ↑/↓ recall earlier
commands. Commands only move around the app; they never run code or change anything.

The Flask sample (`samples/flask-notes.zip`) has no git history, so its roadmap comes from imports
alone. To import from GitHub, paste a link like `https://github.com/owner/repo` (optionally
`/tree/branch`). For private repos, add a fine-grained, read-only `GITHUB_TOKEN` to `.env`.

## What is sent to the AI, and what is not

- Uploads are **never executed, imported or installed**. Zips are read with checks against path
  traversal (zip-slip), absolute paths, symlinks, size lies and oversized uploads (50 MB and 5,000
  files by default, changeable in Settings).
- `node_modules`, build output, binaries, media, lockfiles and keys are skipped.
- **Secrets are removed before anything is stored or sent**: API keys and tokens, private keys,
  JWTs, passwords in connection strings, hard-coded secrets, and every value in `.env` files. The
  project page lists what was removed and where.
- Excerpts of your (redacted) code are sent to Claude when the tutor works. Uploaded code is always
  marked as untrusted data, so instructions hidden in code or READMEs are not followed.
- The original zip is deleted after extraction. Logs never contain code.
- The app listens on `127.0.0.1` only, with a strict Content Security Policy.

## Scripts

| Command                              | What it does                                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                        | Start Retrace on http://127.0.0.1:3000                                                                                      |
| `npm run build` / `npm start`        | Production build and server (also on 127.0.0.1)                                                                             |
| `npm test`                           | Run all tests (no network, no AI: recorded fixtures only)                                                                   |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript                                                                                                         |
| `npm run format`                     | Prettier                                                                                                                    |
| `npm run samples:zip`                | Zip the two sample projects (the to-do app gets a git history)                                                              |
| `npm run db:migrate`                 | Apply database migrations without starting the app                                                                          |
| `npm run live-check -- --yes`        | Opt-in: run the real AI tasks on the to-do sample with your active provider. Add `--record` to save the replies as fixtures |

## Project structure

The code is laid out in build order, so Retrace can one day be uploaded to itself:

```
src/db/          data: schema and connection (Drizzle + SQLite)
src/server/      backend: ingest (safe zip, redaction, GitHub), analysis (imports, git history),
                 ai (providers, prompts, context, tasks), learner profile, settings
src/app/         frontend: pages and API routes (Next.js App Router)
src/components/  shared UI (code viewer, file tree, markdown, states)
src/features/    feature UI: roadmap, workspace, tutor, rebuild, quiz, audit, remix, progress
prompts/         one prompt file per AI task, plus the tutor system prompt
samples/         two small sample projects to practise on
tests/           helpers and recorded AI fixtures
docs/            decisions.md (why each choice) and extending.md (extension points)
```

## Troubleshooting

- **"Your Claude login could not be used"**: your Claude Code session expired. Run
  `npx @anthropic-ai/claude-code`, type `/login`, then **Check again** in Settings. Or switch to the
  API key provider.
- **Port 3000 is busy**: run `npx next dev -H 127.0.0.1 -p 3001`.
- **A GitHub repo is rejected as too big**: GitHub reports the repo's size including history.
  Raise the upload limit in Settings, or upload a zip of just the code.
- **The tutor's answer came back in the wrong format twice**: it retries once automatically; press
  Try again. Switching provider sometimes helps.

## More

- [docs/decisions.md](docs/decisions.md): every dependency and design decision, with the reason.
- [docs/extending.md](docs/extending.md): adding outside context for the tutor (ContextProvider).
