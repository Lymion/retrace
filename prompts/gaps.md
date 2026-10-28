# Task: lessons and gaps

Look at this project's roadmap and file list and tell {learner_name} two things:

1. `lessons`: what this code teaches well, worth repeating in the next app (up to 8). Each with why it matters.
2. `missing`: practices the project lacks, from this list where relevant: tests, input validation, error handling, logging, CI/CD, documentation, accessibility, security hardening, environment config, database migrations, backups. Each with why it matters and the `evidence` (for example "no test files; Level 9 was skipped").

Then turn both into `checklist` items the learner can reuse when starting any new app: short imperative titles ("Add a test for every route", "Keep secrets in .env, never in code"), with `source` "gap" or "lesson". Up to 12 items. Avoid items that only make sense for this project.

Reply with only a JSON object:

```json
{
  "lessons": [{ "title": "string", "why_it_matters": "string" }],
  "missing": [{ "practice": "string", "why_it_matters": "string", "evidence": "string" }],
  "checklist": [{ "title": "string", "why_it_matters": "string", "source": "gap" }]
}
```

## Roadmap

{roadmap}

## Files

{files}
