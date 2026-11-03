---
name: run-plan
description: "Runs an approved Development Plan (plans/<slug>.md) fully autonomously, without asking questions, because the plan was already approved by hand: reads the plan into tasks, a dependency graph, owned paths and an execution mode; runs implementer agents (one per work package, in waves by the graph, or a single one); then architecture-reviewer and plan-verifier in parallel (both read-only); then a bounded fix loop that fixes introduced CRITICAL/HIGH findings and missing/partial plan items and re-reviews only the files that changed; ends with a report and a recommendation to run /pr-self-review. Never calls spec-creator, implementation-planner or test-writer (spec and plan are run by hand; test coverage comes only from the implementers' own steps). Never commits or pushes. Usage: /run-plan plan:plans/<slug>.md [mode:single|multi] [max-fix:3] | /run-plan resume:<slug>"
argument-hint: "plan:<path> [mode:single|multi] [max-fix:N] | resume:<slug>"
disable-model-invocation: true
---

# Run plan

You execute one approved plan from start to report. The plan is the
approval: you do not ask the user anything, and you do not wait. You move
files between agents and apply the fixed rules below; you write no code,
spec or plan yourself, and you keep only verdict lines from each report.

Arguments (`key:value`, any order):

| Argument | Meaning | Default |
|---|---|---|
| `plan:<path>` | the plan file (required unless `resume:`) | — |
| `mode:single` / `mode:multi` | one implementer for every step / one per work package | the plan's `Chosen by the user` |
| `max-fix:<n>` | rounds of the fix loop | 3 |
| `resume:<slug>` | continue from `.claude/run-plan-logs/<slug>.md` | — |

## Limits

- Agents, by exact `subagent_type`: `implementer`, `architecture-reviewer`,
  `plan-verifier`. Never `spec-creator`, `implementation-planner`,
  `test-writer`, `doc-writer` or any `shvab:*` agent (those follow another
  repo's conventions).
- Never commit, push, open a PR, install, migrate or touch a Docker
  volume. Never edit the plan, a spec or source yourself; your only writes
  are the run log and its `.gitignore` line.
- Each agent starts with no memory: its task is a self-contained English
  brief (plan path, package, owned paths, fix list, baseline).
- Exclude the nested `dev-digest/` clone from every search.
- Stop with a report, not a question, when the plan is unusable or a step
  is `blocked`: say what is missing and what decision it needs.

## 1 — Read the plan

Read the plan once and write down:

- **Tasks** — its numbered `Steps` (and `## Amendments` steps `A1…`).
- **Graph** — each step's `Depends on`, and each package's `After` /
  `Parallel with` in `Execution mode`.
- **Owned paths** — per package, the union of its steps' `Files`. In a
  single run, the whole plan's `Files`.
- **Mode** — `mode:` if given, else the plan's `Chosen by the user`.

No path, a missing file, or no `Steps` with `Done when` → stop: planning is
`implementation-planner`'s job, run by hand. Create
`.claude/run-plan-logs/<slug>.md` (slug = file name without `.md`; add
`.claude/run-plan-logs/` to `.gitignore` if absent) and say in one line:
steps, packages, mode, `max-fix`.

On `resume:<slug>` read that log, compare `git status --short` with its
`Tree` line, and continue at its `Phase`.

## 2 — Implement

1. **Baseline, once**: for each touched module, the typecheck and unit
   suite from `.claude/agents/implementer.md` § Checks. Log the summary
   lines.
2. **Waves.** `single`: one `implementer` run, every step. `multi`: group
   packages into waves by the graph; a package whose dependencies are done
   starts. Packages in one wave run **in parallel, in one message**, only
   when the plan marks them `Parallel with` each other or their owned
   paths are disjoint; otherwise one after another.
3. **Brief** for each run: plan path, package id, owned paths, the
   baseline, and — when other packages run at the same time — "other
   implementers are editing this tree: touch only your owned paths; a
   typecheck or test failure in a file you do not own is not yours,
   report it under `For reviewers`".
4. Log each report's step statuses, deviations and `Insight candidates`. A
   `blocked` step: later steps that depend on it are skipped; the rest
   goes on, and the blocker goes to the final report.

## 3 — Review, in parallel

One message, two read-only agents:

- `architecture-reviewer` — "local changes" after
  `node .claude/skills/pr-self-review/scripts/collect-diff.mjs`, plus the
  plan path.
- `plan-verifier` — the plan path and the implementer reports as claims.

## 4 — Bounded fix loop

Collect the findings into a ledger (`F<n>`, key = rule id + file, or plan
item id). **To fix**, and only these:

- an architecture finding that is `introduced`, CRITICAL or HIGH, in a
  file the plan lists;
- a plan-verifier item that is `fail` (missing or partial), including a
  plan-named test that is missing or does not assert the behaviour.

**Not fixed, reported**: MEDIUM/LOW, `pre-existing`, `not determined`,
`unverified` items, and any fix that needs a new seam, a file outside the
plan or a contract change (it is a plan change, for `implementation-planner`
by hand).

Each round, up to `max-fix`:

1. `implementer` fix mode with the `Fix list` (id, `file:line` or plan item,
   what is wrong, the rule or what the plan says).
2. Re-review **only the files that fix changed**: `architecture-reviewer`
   on that file list and `plan-verifier` with "re-check only: <item ids>",
   in parallel.
3. Stop when nothing is left to fix, when the rounds run out, or when a
   finding already fixed comes back (the fix is not converging: report it,
   do not try again).

## 5 — Report

Run `engineering-insights` with the collected insight candidates (writing
nothing is normal), log `Phase: done`, and finish with:

```markdown
# run-plan: <slug> — done | stopped at <phase>

- Plan: `plans/<slug>.md` · mode <single|multi> · <n> steps in <n> packages
- Verification: pass <a> · fail <b> · unverified <c> (last plan-verifier run)
- Fix loop: <rounds used> of <max-fix> · fixed <n> · left <n>
- Commands: <baseline and final summary lines>

## Left open
- F<n> / <item id> — <severity or verdict> — `<file:line>` — <one line> — <why: not introduced | MEDIUM/LOW | plan change | not converging | blocked>
(or "None.")

## Unverified
- <item id> — <why> — would be checked by: <what>
(or "None.")

## Next
Run `/pr-self-review` before opening a PR. This run does not look for correctness bugs (`architecture-reviewer` checks boundaries only): run `/code-review` too. The change is in the working tree, uncommitted.
```

Write messages to the user in their language; the log, briefs, ids and
paths stay in English.

## Run log

`.claude/run-plan-logs/<slug>.md`, updated after every phase, verdict lines
only: `Phase` (implement | review | fix-<n> | done), `Tree` (the count of
`git status --short` lines and the short sha), `Baseline`, one line per
package result, the ledger rows (id, key, severity, status), and the
insight candidates.
