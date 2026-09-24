# Report format

`finalize.mjs` produces both files in `.claude/pr-self-review/`; do not hand-write them.

## `last-report.json`

```jsonc
{
  "verdict": "PASS" | "BLOCKED",         // BLOCKED iff ≥1 active, in-diff CRITICAL
  "mode": "full" | "fast" | "partial",   // only "full" satisfies the pre-PR gate
  "branch", "head_sha", "base", "base_ref",
  "diff_hash",                           // freshness key: base + status/path/content of every changed file
  "stats": { "files", "reviewable", "added", "removed", "untracked" },
  "counts": { "CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO" },
  "blocking": ["F-1a2b3c4d"],            // ids of the CRITICALs
  "findings": [ Finding ],               // active, introduced by the diff, sorted by severity
  "suppressed": [ Finding + suppressed_by ],
  "pre_existing": [ Finding ],           // in_diff:false — never blocks
  "coverage": { "reviewers": [{ "name", "files", "reviewed", "cached" }], "unrouted_skills", "deterministic_only", "warnings" },
  "ci": { "mode", "results": [{ "module", "step", "status", "ms" }] },
  "notes": []
}
```

Finding: `{ id, reviewer, skill, file, line, severity, rule, title?, evidence, suggested_fix,
autofix, in_diff, verified, downgraded? }`. Reviewer ids look like `<skill>/<kebab>`;
deterministic ones `deterministic/<kebab>`; CI `ci/<module>-<step>-failed`.

Severity is downgraded (never silently) when a CRITICAL was not verified (`downgraded` says
why) — except in `fast` mode, where unverified CRITICALs stay CRITICAL to be conservative.

## `last-report.md`

Verdict banner → counts → findings by severity (id, rule, `file:line`, evidence, fix) →
**Coverage** table (reviewer / files / reviewed now / from cache — this is how the user
checks that UI files hit UI skills and backend files hit backend skills) → CI parity →
suppressed → pre-existing → notes.

## PR description template (PASS only) → `.claude/pr-self-review/pr-description.md`

Draft from `manifest.json`, `last-report.json` and `git log <base>..HEAD`. English, concise,
no invented facts. Use it with `gh pr create --body-file …`.

```markdown
## Summary
<2–4 bullets: what changed and why, grouped by module (server / client / reviewer-core / docs / tooling)>

## Changes
<per touched module: the notable files or behaviors, one line each>

## Risks & notes
<migrations, contract/vendored-copy changes, feature flags, follow-ups; open HIGH/MEDIUM findings
from the report that were accepted, each with its id and why>

## Test plan
- [x] <CI-parity results actually run: e.g. "server typecheck + unit tests pass locally">
- [ ] <anything not run: integration tests (`*.it.test.ts`), e2e, manual UI check>

## Self-review
PR Self Review: **PASS** @ `<head_sha7>` (diff `<diff_hash8>`), <n> reviewers,
<counts of HIGH/MEDIUM/LOW> open.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

If the report shows `large-diff`, say so under Risks and suggest the split.
