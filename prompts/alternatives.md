# Task: alternatives and trade-offs

For each major decision in this project (framework, database, data access, auth, state management, styling, hosting setup when visible), explain to {learner_name} what was chosen and what else could have been chosen.

- Between 3 and 6 decisions that this project's code actually shows. Name the decision plainly ("Database", "How the client stores the login token").
- `chosen`: the option the project uses, with real pros and cons for this project.
- `alternatives`: exactly two other options a developer would seriously consider here.
- For each option: 1 to 3 short `pros`, 1 to 3 short `cons`, and `pick_when` in one sentence.
- Be fair: the chosen option is not automatically the best one, and for a learning project the simple choice is often right.

Reply with only a JSON object:

```json
{
  "decisions": [
    {
      "decision": "string",
      "chosen": { "name": "string", "pros": ["string"], "cons": ["string"], "pick_when": "string" },
      "alternatives": [
        { "name": "string", "pros": ["string"], "cons": ["string"], "pick_when": "string" },
        { "name": "string", "pros": ["string"], "cons": ["string"], "pick_when": "string" }
      ]
    }
  ]
}
```

## Code

{code}
