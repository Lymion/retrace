# Handoff

Notes for picking this project up in a fresh session (for example Claude Code on the web, in a
Linux sandbox) without the Windows PC it was built on. No secret values are in this file or in
the repository; variables are named only.

## What this is

**Retrace** (repository `Lymion/retrace`, folder name CodeHelper): a local, single-user app for
learning app development by rebuilding your own finished projects. You upload a project (zip or
`https://github.com/<owner>/<repo>` link); Retrace orders it into levels and offers a tutor tour,
rebuild-from-spec with review, quizzes, a security audit and remix challenges.

- Stack: Next.js 16 (App Router, Turbopack, `src/proxy.ts`), React 19, Tailwind 4, TypeScript 5.9,
  SQLite via better-sqlite3 + Drizzle, Monaco (served from `public/monaco`), Vitest.
- AI: Claude, through either the **api-key** provider (`ANTHROPIC_API_KEY`) or the
  **claude-login** provider (the local Claude Code login, via the Agent SDK).
- Desktop: an Electron 45 wrapper (`electron/`) with an NSIS Windows installer and automatic
  updates from GitHub Releases.
- Read first: `README.md` (user guide), `CLAUDE.md` + `AGENTS.md` (agent rules: this Next.js
  version differs from training data, read `node_modules/next/dist/docs/` before Next code),
  `docs/decisions.md` (why each dependency and choice), `docs/opus-brief.md` (the last brief,
  with its security rules), `docs/extending.md`.

## Current state (as of 17 November 2026)

`master` and `plan-next` both point at the same commit; everything below is merged and pushed.

Done recently (the four parts of `docs/opus-brief.md`):

1. **Fewer tokens:** prompt caching on the api-key provider, history and lesson budgets, saved
   lessons reused for free (regenerate button), economy mode, per-call token usage stored in the
   `ai_usage` table and shown in the status line and Settings.
2. **Terminal redesign:** ink blue-black theme with colour by role, titled panes, command palette
   (Ctrl K / `:`), j/k and 1–4 keys in the workspace, status line.
3. **Desktop app:** `npm run dist` builds `release/Retrace-Setup-<version>.exe` (about 257 MB,
   unsigned). The local server only answers requests carrying a per-launch secret cookie.
4. **Automatic updates:** electron-updater reads releases from `Lymion/retrace` (named in
   `package.json` → `build.publish`). Verified end to end: an installed 0.1.0 found release
   v0.1.1, downloaded it, showed the update line, and reopened as 0.1.1.

Checks at the last commit: `npm run typecheck` and `npm run lint` clean, `npm test` 280 passing.

Not yet tested: the api-key provider's cache path against the real API, the uninstaller,
clicking through every screen of the installed app, and the fixed `npm run release` flow (see
gotchas). Structured output for JSON tasks was deliberately skipped.

## Next three steps

1. **Check prompt caching on the api-key provider** (works in the cloud if you have a key): set
   `ANTHROPIC_API_KEY`, switch Settings to api-key, run `npm run live-check -- --yes`, and confirm
   a second tutor turn on the same level reports cache-read tokens in the `ai_usage` table.
2. **Refresh stale docs:** the "Status" section of `CLAUDE.md` still says the latest commit is
   the grey dark mode; update it to the state above. Add a download link to the GitHub Releases
   page in the README's "As a Windows app" section.
3. **Next desktop release, from a Windows PC only:** run `npm run release` once to prove the
   draft-then-publish flow in `scripts/release.mjs`, install it over 0.1.1 and confirm the
   update, then test the uninstaller from Windows Settings → Apps.

## Running and testing in a Linux cloud sandbox

Needs Node 22 or newer and npm.

```bash
npm install            # postinstall copies Monaco into public/monaco
cp .env.example .env
npm run db:migrate     # creates data/retrace.db
npm run dev            # http://127.0.0.1:3000
```

```bash
npm run typecheck
npm run lint
npm test               # no network, no AI: recorded fixtures only
```

Environment variables (put them in `.env`, which is git-ignored; see `.env.example`):

| Name                                                                                                                           | Needed for                                               | Where to get it                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`                                                                                                            | api-key provider only                                    | console.anthropic.com → API keys                                                    |
| `GITHUB_TOKEN`                                                                                                                 | optional: importing private GitHub repos                 | github.com → Settings → Developer settings → fine-grained token, read-only Contents |
| `GH_TOKEN`                                                                                                                     | optional: `npm run release` (or it uses `gh auth token`) | a token allowed to create releases in `Lymion/retrace`                              |
| `TUTOR_MODEL`, `FAST_MODEL`, `MAX_UPLOAD_MB`, `MAX_FILES`, `AI_RATE_LIMIT_PER_MIN`, `RETRACE_DATA_DIR`, `RETRACE_CONTEXT_FILE` | defaults in `.env.example`                               | no secret                                                                           |

`RETRACE_DESKTOP_SECRET`, `RETRACE_DESKTOP_BUILD` and `RETRACE_APP_VERSION` are set by the
desktop build and the Electron main process; leave them unset in a browser or sandbox (with no
desktop secret set, the request check in `src/proxy.ts` is off).

Sample projects for manual testing: `npm run samples:zip`, then upload
`samples/todo-express-react.zip`. The `samples/*/.env` files hold deliberate fake values that
test the secret redaction; leave them.

## Only works on the Windows PC

- `npm run dist`, `npm run release` and `npm run desktop:dev`: the NSIS installer, the Electron
  window and the Windows title bar overlay. A Linux sandbox can still typecheck the `electron/`
  code (`npm run typecheck` covers it) but cannot build or run the installer.
- The "open data folder" button (`/api/desktop/data-folder`) only works on Windows desktop builds.
- The **claude-login** provider needs a Claude Code login on the machine. A cloud sandbox
  normally has none, so use the api-key provider there, or just run the tests (which need no AI).
- The installed app keeps its data in `%APPDATA%\Retrace` on that PC; it is not in the repository.

## Gotchas

- **Security rules stay in force** (full list in `docs/opus-brief.md` and the README): never
  execute, import or install uploaded code; redact secrets before storing or sending; delete
  uploaded zips after extraction; accept only `https://github.com/<owner>/<repo>` links; never put
  tokens in logs or prompts; in claude-login mode strip `ANTHROPIC_API_KEY` from the child
  environment and run the agent with no tools, one turn, in an empty temp folder.
- **The repository is public** (needed so installed apps can read releases). Never commit `.env`,
  `data/`, `release/` or any real key; justify each new dependency in `docs/decisions.md`.
- **Default branch is `master`**, not `main`.
- **Tailwind 4 layers:** unlayered CSS beats layered utilities, so component rules live in
  `@layer components` and the card-title rules in `@layer utilities` in `src/app/globals.css`.
  A rule that seems ignored is usually a layer problem.
- **`next dev` rewrites `AGENTS.md`** with its own block; committing that block keeps the tree
  clean.
- **Releases:** `scripts/release.mjs` bumps the version, has electron-builder upload a draft, then
  publishes the draft only if it holds both the installer and `latest.yml`. Publishing directly
  made electron-builder race itself (HTTP 422), which is why v0.1.1's `latest.yml` was uploaded
  by hand. The new flow has not run against a real release yet.
- **Unsigned app:** SmartScreen warns on install, and updates are only hash-checked, not
  signature-checked, so anyone who can publish to the repository can ship code to installed
  copies. Keep two-factor sign-in on the GitHub account.
- **Testing the installed app from inside the Claude desktop app:** Windows redirects files
  written by programs started from it (MSIX), so the app's data lands under the Claude package's
  `LocalCache`, not `%APPDATA%\Retrace`. Launch from the Start menu for a true picture.
