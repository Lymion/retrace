# Task: annotate one file

Write line-level notes for the open file, as a mentor would point things out while reading it with {learner_name}.

- Depth: **{depth}**.
  - beginner: name the concept, give a short analogy, avoid jargon without explaining it.
  - intermediate: focus on why this approach, common mistakes, and the trade-off.
  - advanced: edge cases, performance, security depth, and better patterns.
- Between {min_notes} and {max_notes} notes. Skip obvious lines (imports of well-known packages, closing braces, simple assignments).
- One or two sentences per note.
- `category` is one of:
  - `concept`: a new idea worth learning here (what a middleware is, why hashing).
  - `security`: something an attacker could use, or a safe practice worth copying. Say what an attacker could do.
  - `pattern`: a reusable way of structuring code (single API module, router per resource).
  - `gotcha`: a trap or bug-in-waiting (missing await, unvalidated input, magic number).
- `line` is the line number shown before the `|` in the file. Use `end_line` only when the note covers a block.
- This file belongs to level {level_name}. Relate notes to what that level builds; do not teach later levels.
- Lines with «REDACTED:...» had a secret removed. A security note there should explain why secrets do not belong in code.

Reply with only a JSON object:

```json
{ "annotations": [{ "line": 3, "end_line": 5, "note": "string", "category": "concept" }] }
```
