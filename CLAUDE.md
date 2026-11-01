@AGENTS.md

# Retrace (folder: CodeHelper)

Learn app development by rebuilding your own finished projects level by level: upload a project (zip or GitHub link), Retrace orders it into levels with a tutor tour, a rebuild-from-spec, quizzes, a security audit and remix challenges. Runs on localhost only, one user.

- Stack: Next.js + TypeScript, SQLite via Drizzle, Monaco editor, Vitest.
- AI: Claude via `ANTHROPIC_API_KEY` in `.env`, or the local Claude Code login.

## Run
Needs Node 22+.
```bash
npm install                  # also copies Monaco into public/monaco
cp .env.example .env
npm run db:migrate
npm run dev                  # http://127.0.0.1:3000
```
Checks: `npm run typecheck`, `npm run lint`, `npm test`.

## Status
- Working app; latest commit is the neutral grey dark mode.
- `samples/*/.env` are deliberate fake values for the sample projects.
