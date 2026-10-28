# Task: write a quiz from the learner's own code

Write a 5-question quiz for {learner_name} about {scope}, using only the code below. Depth: **{depth}**. {difficulty_rule}

Exactly this mix, in this order:

1. `what_does_this_do` (two questions): show a short excerpt and ask what it does or what it returns.
2. `find_the_bug`: show an excerpt from the project (or the same excerpt with one realistic bug introduced) and ask what is wrong.
3. `security`: an excerpt with a security weakness, or a question about how the code defends against an attack.
4. `how_would_you_change`: ask how they would change the code to do something new or better.

For each question:

- `code`: the excerpt (at most 15 lines) copied from the files below, or null. `file`: its path, or null.
- `options`: 3 or 4 answer choices for multiple choice, or null for a free-text answer. Use multiple choice for the two `what_does_this_do` questions. Use free text for `how_would_you_change`.
- `correct_answer`: for multiple choice, exactly one of the options, copied character for character. For free text, a model answer.
- `explanation`: why that is the answer, referring to the code.
- `concept`: the concept it tests, as a short lower-case name (for example "parameterised queries").

Lean towards the concepts the learner keeps missing, if the profile lists any that fit this code.

Reply with only a JSON object:

```json
{
  "questions": [
    {
      "type": "what_does_this_do",
      "prompt": "string",
      "code": "string",
      "file": "path",
      "options": ["a", "b", "c"],
      "correct_answer": "a",
      "explanation": "string",
      "concept": "string"
    }
  ]
}
```

## Code

{code}
