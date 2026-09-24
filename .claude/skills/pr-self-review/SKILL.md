---
name: pr-self-review
description: "PR Self Review — pre-PR gate for local changes. Run before opening a pull request (before `gh pr create`) or manually. Collects every open change (branch commits, staged, unstaged, untracked), routes files to the repo's skills (UI files → react/next/frontend-architecture/testing skills, backend files → onion-architecture/fastify/drizzle/postgres skills, security + zod + typescript by content), runs project-specific deterministic checks (secrets, applied-migration edits, vendored-code drift, PR size, CI parity), verifies every CRITICAL finding, and forbids opening/merging the PR while any confirmed CRITICAL remains. Trigger terms: PR self review, self-review, review before PR, pre-PR check, before opening a pull request, gh pr create, can I open a PR, is this ready to merge."
argument-hint: "[--base <ref>] [--fast] [--fix] [--no-cache] [--no-ci]"
---

# PR Self Review

Reviews **local, not-yet-PR'd changes** against the skills this repo already has, then
decides one thing: **PASS** or **BLOCKED**. Any confirmed CRITICAL finding = BLOCKED =
do not open the PR and do not merge.

Files here: [routing.json](routing.json) (path → skills, machine-read) ·
[routing.md](routing.md) (why) · [severity-rubric.md](severity-rubric.md) ·
[project-rules.md](project-rules.md) · [prompts.md](prompts.md) (agent prompts) ·
[report-format.md](report-format.md) (report + PR-description template) ·
[scripts/](scripts/) (deterministic plumbing). The verdict is computed by
`finalize.mjs`, never by you — do not hand-edit `last-report.json`.

`S=.claude/skills/pr-self-review/scripts` · state lives in `.claude/pr-self-review/`
(gitignored, except `suppressions.json`).

## Arguments

| Flag | Effect |
|---|---|
| `--base <ref>` | Compare against `<ref>` instead of `origin/main` (fallback `main`) |
| `--fast` | Draft check while iterating: typecheck only, **no** verification pass. Report is `fast` mode → does **not** satisfy the pre-PR gate |
| `--fix` | After reviewing, apply findings marked `autofix` and re-run (max 2 rounds) |
| `--no-cache` | Ignore cached per-file results |
| `--no-ci` | Skip the CI-parity commands. Report is `partial` → does **not** satisfy the gate |

## Workflow

Report progress to the user in their language; keep the state files in English.

1. **Collect** — `node $S/collect-diff.mjs [--base ref]`. Covers branch commits + staged +
   unstaged + untracked; excludes the nested `dev-digest/` clone, lockfiles, generated and
   binary files. If `stats.reviewable` is 0 the change is docs/config only — still run the
   remaining steps (deterministic checks make the report the gate needs).
2. **Route** — `node $S/route.mjs`. Prints reviewer → file counts. It discovers every skill
   in `.claude/skills/`, applies [routing.json](routing.json), and falls back to the
   README scope for a skill no rule mentions (reported as *unrouted* — tell the user to add a
   rule). Show the user this routing table: it is how they verify UI files went to UI skills
   and backend files to backend skills.
3. **Cache split** — `node $S/cache.mjs split [--no-cache]`. Only files changed since the
   last run (per reviewer) are re-reviewed; this makes re-runs after a fix cheap.
4. **Start CI parity in the background** (skip with `--no-ci`) —
   `node $S/ci.mjs` (or `--typecheck-only` with `--fast`) via Bash `run_in_background`.
   It mirrors `.github/workflows/*`: typecheck + unit tests for every touched module
   (reviewer-core changes also run `server`). It does not run integration tests or e2e.
5. **Review in parallel** — for each reviewer in `plan.json` with a non-empty `to_review`,
   spawn one `general-purpose` Agent **in the same message** (parallel), using the reviewer
   prompt in [prompts.md](prompts.md). Each agent writes
   `.claude/pr-self-review/findings/<reviewer>.json` and never edits source. If an agent
   fails, re-run just that one; do not proceed with a silently missing reviewer.
6. **Deterministic checks** — `node $S/checks.mjs` (secrets, applied-migration edits, schema
   without migration, `down -v`, vendored drift, logic-without-tests, PR size, gate-config
   changes). No LLM involved.
7. **Verify every CRITICAL** (skip with `--fast`) —
   `node $S/pending-verification.mjs` lists CRITICAL findings still unverified. Spawn
   verifier agents (≤5 findings each, [prompts.md](prompts.md)); they write
   `.claude/pr-self-review/verdicts/<n>.json`. `rejected` drops the finding, `uncertain`
   downgrades it to HIGH, `confirmed` keeps it CRITICAL. Blocking is expensive, so a CRITICAL
   must survive a second, independent look.
8. **Cache store** (skip with `--fast`) — `node $S/cache.mjs store`.
9. **Finalize** — wait for the CI job, then `node $S/finalize.mjs` (add `--fast` for fast
   mode). It merges reviewer + cached + deterministic + CI findings, applies
   `.claude/pr-self-review/suppressions.json`, computes the verdict, writes
   `last-report.json` / `last-report.md` and prints the report. Relay it to the user
   (translated summary; keep finding ids, rule ids and paths verbatim).
10. **`--fix`** — for findings with `"autofix": true` in `last-report.json`: apply
    `suggested_fix` with Edit, one finding at a time, then re-run steps 1–9 (cache keeps it
    cheap). Max 2 rounds. Never auto-fix: anything under `deterministic/secret-*`,
    migrations, or a finding without `autofix: true`. Show the user what was changed.
11. **Outcome**
    - **BLOCKED** — list the blocking findings, say plainly the PR must not be opened or
      merged, and offer `--fix` / help fixing. Do **not** run `gh pr create`, do not suggest
      bypassing the gate. Only fixing the code (or a valid suppression, below) clears it.
    - **PASS** — write `.claude/pr-self-review/pr-description.md` from the template in
      [report-format.md](report-format.md) and offer
      `gh pr create --body-file .claude/pr-self-review/pr-description.md`. Mention open
      HIGH/MEDIUM items as recommendations.

## The gate (three levels)

1. **This skill** refuses to open the PR when BLOCKED (step 11).
2. **Pre-PR hook** — `.claude/settings.json` runs `scripts/hook-pre-pr.mjs` on every Bash call
   and blocks `gh pr create` unless `scripts/gate.mjs` finds a **fresh, full-mode, PASS**
   report. Fresh = the report's `diff_hash` (base + every changed file's content) equals the
   current state, so any edit after the review invalidates it. Opening a PR through the
   GitHub web UI is not covered by this level.
3. **GitHub (phase 2, not wired)** — the only way to *technically* forbid a merge is a
   required status check: post `pr-self-review` as a commit status
   (`gh api repos/{owner}/{repo}/statuses/<sha> -f state=failure -f context=pr-self-review`)
   and mark that context required in branch protection. That publishes to GitHub and needs
   repo admin — only do it when the user explicitly asks.

## Suppressions (false positives)

`.claude/pr-self-review/suppressions.json` (committed, team-visible):

```json
{ "suppressions": [
  { "rule": "react-best-practices/derived-state", "path": "client/src/app/foo/**",
    "reason": "why this is a false positive", "expires": "2026-12-31", "approved_by": "name" }
] }
```

`rule`, `reason` and `expires` are required; **CRITICAL also requires `approved_by`**.
Expired or reason-less entries are ignored (and an expired one raises a MEDIUM finding).
Suppressed findings still appear in the report. Editing this file is itself flagged
(`deterministic/gate-config-changed`, HIGH) so it gets human eyes. Never add a suppression
yourself to get a PASS — only when the user asks, with their reason.

## Rules for the assistant

- Never claim PASS from anything but `last-report.json` produced by `finalize.mjs`.
- Only diff-introduced problems block. Problems already in the file are reported as
  *pre-existing* and never block.
- Do not weaken severities to unblock the user; do not edit the rubric or routing mid-run.
- When the task ends, run the `engineering-insights` skill as CLAUDE.md requires.
