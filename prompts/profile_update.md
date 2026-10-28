# Task: update the learner profile

Below are things {learner_name} recently asked the tutor, and their current profile. Work out what the questions say about which concepts they understand and which they keep missing.

- Asking "what is X" or "I don't get X" (or "tak faham X") suggests X is weak: a small negative delta.
- Asking a deeper follow-up ("why X instead of Y", "what about edge case Z") suggests the basics of X are solid: a small positive delta.
- One question is weak evidence: keep each delta between -0.15 and 0.15 unless several questions point the same way (never beyond -0.3 or 0.3).
- Use short lower-case concept names that match the profile where possible (for example "jwt", "sql injection", "express router").
- `note`: one short sentence the tutor can use next time, such as "Confuses hashing with encryption; try the shredder analogy."
- Skip questions that are only greetings, thanks or about the app itself. Return an empty `changes` list if nothing is learnable.

Reply with only a JSON object:

```json
{ "changes": [{ "concept": "string", "layer": "security", "delta": -0.1, "note": "string" }] }
```

Layers: frontend, backend, database, security, config, test, other.

## Current profile

{profile}

## Recent questions (oldest first)

{events}
