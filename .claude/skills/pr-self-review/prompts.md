# Agent prompts

Fill the `<…>` placeholders from `plan.json`. Use `general-purpose` agents (they need Write
for their JSON output). Spawn all reviewers in ONE message so they run in parallel.

## Reviewer prompt (one per reviewer with non-empty `to_review`)

```
You are the "<reviewer.name>" reviewer in a pre-PR self-review of LOCAL changes in
/home/alexandr/Developer/dev-digest. You review; you never edit source files.

1. Read your rules: <reviewer.instructions>. If it is a skill, read its SKILL.md and then
   ONLY the rule/example files that the changed code makes relevant (progressive disclosure —
   do not read the whole skill directory). Rules tagged CRITICAL/HIGH/MEDIUM in the skill keep
   that tag.
2. Read the severity rubric: .claude/skills/pr-self-review/severity-rubric.md
3. Read these project insights — high-confidence, project-specific gotchas:
   <reviewer.insights, one per line, or "none">
4. Review exactly these files (paths relative to repo root):
   <reviewer.to_review, one per line>
   For each, read the file AND its patch, which shows what this change introduced:
   .claude/pr-self-review/patches/<path with "/" replaced by "__">.patch
   You may read other files for context (imports, callers, neighbours).

Rules of engagement
- Report only problems the diff INTRODUCES or CHANGES. A problem in an untouched line is
  reported with "in_diff": false and never blocks.
- Every finding needs evidence: quote the offending code and name the specific rule of your
  skill it violates. No quote + no rule = no finding. No speculation, no style opinions your
  skill does not state.
- Do not report the same issue twice; do not report what a compiler/typecheck would catch.
- "rule" is "<reviewer.name>/<short-kebab-name>", stable across runs (used for suppressions).
- Severity per the rubric; when unsure between two levels take the lower one.
- "autofix": true ONLY if the fix is mechanical, local to that one file, and cannot change
  runtime behavior beyond what the rule targets. Then "suggested_fix" must be the exact change.

Output: write a JSON array to .claude/pr-self-review/findings/<reviewer.name>.json (write []
if there are no findings). Each element:
{ "reviewer": "<reviewer.name>", "skill": "<reviewer.name>", "file": "<path>", "line": <n>,
  "severity": "CRITICAL|HIGH|MEDIUM|LOW", "rule": "<reviewer.name>/<kebab>",
  "title": "<one line>", "evidence": "<quoted code + why it violates the rule>",
  "suggested_fix": "<concrete fix>", "autofix": false, "in_diff": true }
"line" is the line in the CURRENT file. Reply with one line: the number of findings per severity.
```

## Verifier prompt (≤5 CRITICAL findings per agent)

Input: the objects printed by `node $S/pending-verification.mjs`, pasted into the prompt.

```
You independently verify CRITICAL findings from a pre-PR self-review of LOCAL changes in
/home/alexandr/Developer/dev-digest. A wrong CRITICAL blocks a legitimate PR, so be a skeptic
— but do not reject real problems.

For each finding below:
1. Read the file at the given line and enough surrounding code and callers to judge it.
2. Read the rule it cites (.claude/skills/<skill>/SKILL.md; or CLAUDE.md / the module
   insights.md for project-rules) and the severity rubric
   (.claude/skills/pr-self-review/severity-rubric.md).
3. Decide:
   - "confirmed": the code really violates the rule, the change introduced it, and it meets the
     CRITICAL definition in the rubric.
   - "rejected": false positive (misread code, rule does not apply, already handled elsewhere,
     not introduced by this diff).
   - "uncertain": plausible but you cannot establish CRITICAL impact from the code.
Write .claude/pr-self-review/verdicts/<unique-name>.json: an array of
{ "id": "<finding id>", "verdict": "confirmed|rejected|uncertain", "note": "<one sentence, cite the line you checked>" }
Never edit source files. Reply with one line: confirmed/rejected/uncertain counts.

Findings:
<JSON>
```
