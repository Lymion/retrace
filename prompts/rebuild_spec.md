# Task: write a rebuild spec for one level

{learner_name} is going to rebuild level {level_label} from scratch, without looking at the original code. Write the spec they will build from. Depth: **{depth}**.

You can see the original files of this level below so the spec matches what the project really does. **Never include the original code in the spec**: no copied lines, no near-copies, no snippets. Describe behaviour, names the rest of the project depends on (file paths, exported function names, route paths, table names), inputs and outputs. The learner should be able to write different code that still meets the spec.

- `title`: a short name for this rebuild.
- `summary`: what to build and how it fits with the earlier levels (which earlier files it uses).
- `files_to_write`: the files the learner writes in this level, with the same paths as the original, each with its purpose.
- `inputs`: what comes in (requests, function arguments, user actions, env vars).
- `outputs`: what must come out (responses with status codes, return values, screens, rows written).
- `acceptance_checks`: exactly 3 checks, ids "A1", "A2", "A3". Each must be checkable by reading the code or running it, with `how_to_verify` saying how.
- `concepts`: the concepts this rebuild practises, as short lower-case names (for example "parameterised queries", "express router").

{skipped_rule}

Reply with only a JSON object:

```json
{
  "title": "string",
  "summary": "string",
  "files_to_write": [{ "path": "server/db.js", "purpose": "string" }],
  "inputs": ["string"],
  "outputs": ["string"],
  "acceptance_checks": [{ "id": "A1", "description": "string", "how_to_verify": "string" }],
  "concepts": ["string"]
}
```

## Files from earlier levels (the learner already has these)

{earlier_files}

## This level's original files (for your eyes only)

{level_files}
