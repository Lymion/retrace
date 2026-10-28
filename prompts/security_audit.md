# Task: security audit

Audit {scope} of this project for security problems, the way a friendly senior developer would review it with {learner_name}.

- Look for real issues in the code you were given: injection (SQL, command, path), XSS, broken or missing authentication and authorization, secrets in code, weak password handling, missing input validation that leads to harm, unsafe CORS, missing rate limits on login, sensitive data in logs or responses, insecure defaults, dependency risks visible in manifests.
- Only report what the code actually shows. Cite the file path exactly as given and the line number from the `<file>` block.
- `severity`: critical (anyone can take over accounts or read all data), high (serious data exposure or account abuse), medium (needs some conditions), low (hardening).
- `attacker_view`: in plain language, what an attacker could actually do, step by step if short.
- `fix`: the concrete change, with a short code snippet when it helps.
- Lines with «REDACTED:...» had a secret removed before you saw them: report that the secret was in the code (a finding), not its value.
- Return an empty list if you find nothing real. Do not pad.

Reply with only a JSON object:

```json
{
  "findings": [
    {
      "file": "path",
      "line": 12,
      "severity": "high",
      "title": "string",
      "attacker_view": "string",
      "fix": "string"
    }
  ]
}
```

## Code

{code}
