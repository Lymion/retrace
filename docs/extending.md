# Extending Retrace

Retrace is built so new features plug into a few small, well-defined places. This page covers the
extension points that exist today, and how the "later" ideas from the brief fit in.

## Outside context for the tutor (`ContextProvider`)

A context provider adds a short piece of text to every tutor prompt (chat, Explain this selection
and Tour lessons), right after the learner profile. Use it to bring in context from outside
Retrace, for example notes from a separate screen-annotation tool.

### The interface

`src/server/context-providers/types.ts`:

```ts
interface ContextRequest {
  projectId: number;
  fileId: number | null; // the file open in the workspace
}

interface ContextProvider {
  readonly id: string; // short, unique, lower-case
  readonly label: string; // shown in the prompt and logs
  provide(request: ContextRequest): string | null; // fast; null = nothing to add
}
```

### The stub: a JSON notes file

`src/server/context-providers/json-file.ts` reads notes from a JSON file that another tool writes.
Turn it on by setting a path in `.env`, then restart Retrace:

```bash
RETRACE_CONTEXT_FILE=data/outside-notes.json
```

File format (`projectId` and `filePath` are optional; a note without them applies everywhere):

```json
{
  "notes": [
    {
      "text": "Haykal circled the /search route and wrote 'why?'",
      "projectId": 3,
      "filePath": "server/routes/todos.js"
    },
    { "text": "Haykal prefers analogies about football." }
  ]
}
```

The file is re-read on every request, so the other tool can update it while Retrace runs. A
missing, oversized (over 64 KB) or malformed file adds nothing.

### Writing your own provider

1. Create a file in `src/server/context-providers/` that returns a `ContextProvider`.
2. Register it once with `registerContextProvider(provider)`, for example in `loadBuiltIns()` in
   `src/server/context-providers/registry.ts`, behind an `.env` switch like the stub.
3. Keep `provide()` fast and synchronous. Read from a file, a local socket cache or memory; do the
   slow work elsewhere and cache it.

### Safety rules (enforced by the registry)

- Provider text is untrusted data, like uploaded code. It goes inside an
  `<outside_context source="id">` tag that the system prompt tells the tutor never to obey, and a
  provider cannot close that tag early.
- Each provider's text is capped at 4,000 characters.
- A provider that throws is skipped and logged; the tutor still answers.
- Never put secrets in provider text: it is sent to the AI provider.

Tests: `src/server/context-providers/context-providers.test.ts` shows a fake provider's output
appearing in the tutor context.

## Designed for later (not built)

### Hardware projects (Arduino, ESP32)

- The `project.profile` column already exists (`web` or `hardware`), and
  `src/shared/levels.ts` has `HARDWARE_LEVELS`: setup, wiring and pin map, firmware core, sensors
  and actuators, communication, logic, calibration, testing, power and enclosure.
- The roadmap prompt already uses the template that matches the project's profile.
- Still to build: a way to choose the profile on upload (or detect `.ino` / `platformio.ini`), a
  hardware version of the deterministic draft (`src/server/analysis/level-draft.ts`), and a pin-map
  view.

### An OS-level floating tutor (Tauri or Electron)

The tutor panel can already float, drag and collapse inside the browser. A desktop wrapper would
load `http://127.0.0.1:3000/projects/<id>/workspace` in an always-on-top window. Nothing in the
server needs to change; the wrapper must keep binding to localhost only.

### Spaced repetition

`learner_concept.lastSeenAt`, `hits` and `misses`, plus every `quiz_attempt`, are already stored.
A scheduler can pick concepts that are due (low mastery or not seen for a while) and ask
`quiz_generate` to focus on them, through the profile block it already reads.

### Running code in a sandbox

Retrace never runs uploaded code, and that rule stays. A sandbox would have to be a separate,
locked-down container (no network, no host files, time and memory limits), never a process on the
learner's machine, and would get its own decision in `docs/decisions.md` first.
