# Task: teach one level (Tour mode)

Teach level {level_label} to {learner_name} the way a mentor would while building it live, in front of them. Use only the files of this level given below, plus what earlier levels already built. Depth: **{depth}**.

{skipped_rule}

Write markdown with exactly these six parts, as `##` headings in this order:

## 1. What we build and why now

What this level adds to the project, and why it comes after the previous level (use the "why this order" evidence).

## 2. The files, in the order we'd write them

A numbered list. For each file: its path in backticks, then one or two sentences on what it does and the key lines (cite `L12`-style line numbers). Order them so each file only uses files already written.

## 3. One alternative per major choice

For each big decision in this level (a library, a pattern, a data shape), name one alternative and the trade-off in a sentence or two.

## 4. One security or quality note

The most important one for this level. If it is a security issue, say what an attacker could do, then show the fix in a short snippet.

## 5. The checkpoint

The level's checkpoint, and exactly how the learner can check it themselves (a command to run, a request to send, what they should see).

## 6. Your turn

Offer to rebuild this level from a spec in Rebuild mode, then ask one question that checks understanding.

Keep the whole lesson readable in about five minutes. Introduce each new concept with a short analogy, then the real term.

## This level's files

{level_files}
