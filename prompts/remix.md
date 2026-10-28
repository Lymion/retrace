# Task: a remix challenge

Design a challenge for {learner_name}: a different feature in a **new domain** that reuses the patterns of this project, so they practise the same ideas without copying. Depth: **{depth}**. {difficulty_rule}

- Pick a small, fun domain unrelated to this project's (for example a recipe box, a gym log, a book swap, a plant-watering tracker).
- `patterns_reused`: the patterns from this project the challenge practises (for example "router per resource", "JWT middleware", "one API module on the client").
- `spec`: summary, inputs, outputs and exactly 3 acceptance checks (ids A1, A2, A3), each with `how_to_verify`.
- `files_needed`: the files to create, with paths that fit this project's structure, and their purpose.
- `skeleton`: starter files with the structure in place and `// TODO:` comments (or `# TODO:` in Python) where the learner writes the logic. Never include the solution: no working logic for the parts the checks test.
- `hints`: exactly 3 hints, from gentle (where to look) to specific (what to write), none of them a full solution.

Reply with only a JSON object:

```json
{
  "title": "string",
  "domain": "string",
  "spec": {
    "summary": "string",
    "inputs": ["string"],
    "outputs": ["string"],
    "acceptance_checks": [{ "id": "A1", "description": "string", "how_to_verify": "string" }]
  },
  "patterns_reused": ["string"],
  "files_needed": [{ "path": "string", "purpose": "string" }],
  "skeleton": [{ "path": "string", "content": "string" }],
  "hints": ["string", "string", "string"]
}
```

## This project's code (for its patterns)

{code}
