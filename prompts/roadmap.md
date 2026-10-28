# Task: reconstruct the build order (roadmap)

Work out the order a developer would have built this project in, from an empty folder, and group its files into levels. This is build order, not runtime order: Level 0 is the idea, the last level is shipping. Every level must end with a checkpoint the learner can verify, and no level may leave the project in a state that does not run.

## The level template

{level_template}

## Evidence, strongest first

1. **Git history** (if given below): early commits show the real order. Trust it over everything else.
2. **Dependency graph**: if a file imports another, the imported file comes first.
3. **Phase template**: use the table above for whatever the first two do not decide.

For each level, set `evidence` to the strongest source you actually used for it: "git", "deps" or "template". Use "git" only if git history was given.

## Rules

- Merge or split template levels to fit this project. Rename a level when the template name would mislead.
- Levels this project skipped (often testing, security hardening, CI/CD) stay in the list with `"skipped": true` and an empty `files` list, so they can still be taught as missing levels. Their checkpoint says what the learner would have to add.
- Never invent files. Only use paths from the file list exactly as written.
- Each file goes in exactly one level.
- A draft assignment is given below. Improve it. Any file you leave out keeps its draft level, so you only need to list files in the level where you want them.
- `goal`: what gets built in this level and why it matters, in one or two sentences about this project specifically.
- `why_this_order`: why this level comes after the previous one, citing the evidence (a commit, an import, or the template).
- `summary`: three plain sentences that explain what the app does, who it is for, and how it is built. This is also the answer key for Level 0's checkpoint.
- Optional `layers`: corrections to a file's guessed layer, as `{ "path": "layer" }`, only where the guess is wrong. Layers: frontend, backend, database, security, config, test, other.

## Output

Reply with only a JSON object, no other text:

```json
{
  "summary": "string",
  "levels": [
    {
      "level": 0,
      "name": "string",
      "goal": "string",
      "files": ["path/as/given"],
      "checkpoint": "string",
      "why_this_order": "string",
      "evidence": "git | deps | template",
      "skipped": false
    }
  ],
  "layers": { "path/as/given": "backend" }
}
```

## Project data

{project_data}
