# run-plan

`/run-plan` takes an **approved** plan and carries it out on its own, then
reports. You write the spec (`/spec-creator`) and the plan
(`implementation-planner`) by hand first; the plan is your approval, so
this command never asks a question.

```
/run-plan plan:plans/<feature>.md
/run-plan plan:plans/<feature>.md mode:single max-fix:2
/run-plan resume:<feature>
```

| Argument | Meaning | Default |
|---|---|---|
| `plan:<path>` | the plan to run | required |
| `mode:single` / `mode:multi` | one implementer for all steps / one per work package | the mode chosen in the plan |
| `max-fix:<n>` | rounds of the fix loop | 3 |
| `resume:<slug>` | continue an interrupted run from `.claude/run-plan-logs/<slug>.md` (gitignored) | — |

## What it does

1. Reads the plan: tasks (its `Steps`), the dependency graph (`Depends on`,
   packages' `After` / `Parallel with`), owned paths (the `Files` of a
   package's steps) and the execution mode.
2. `implementer` × N — by waves of the graph, packages with no
   dependency between them in parallel on their owned paths, or a single
   run. Each one verifies itself (typecheck and its steps' tests).
3. `architecture-reviewer` ‖ `plan-verifier` — in parallel, read-only.
4. A bounded fix loop (`max-fix`): fixes introduced CRITICAL/HIGH
   architecture findings and failing (missing or partial) plan items, then
   re-reviews only the files that changed.
5. A report, and the advice to run `/pr-self-review`. It never commits or
   pushes.

## What it does not call

- `spec-creator`, `implementation-planner` — run separately, by hand.
- `test-writer` — switched off on purpose, to save tokens. Test coverage
  comes only from the tests the plan puts in its steps, which the
  implementers write and the verifier checks.
- `doc-writer` — run it by hand after the report if the feature needs docs.
- `/code-review` — `architecture-reviewer` checks boundaries only, not
  correctness bugs. Run `/code-review` yourself before the PR.

## Models

`architecture-reviewer` and `plan-verifier` run on `sonnet`, like the
implementer: their verdicts rest on quoted code and command output. The
cost is that reviewer and implementer are no longer different models. If a
verifier misses subtle `partial` items, put `model: opus` back in
`.claude/agents/plan-verifier.md`.

## Plan format

The command reads the plan the `implementation-planner` writes: `Steps`
with `Files`, `Depends on`, `Skills`, `Tests`, `Done when`, and
`Execution mode` with its work-package table. It is read by an LLM, not a
parser — keep those headings and fields as the template has them. This
repo keeps plans in `plans/`, not `docs/plans/`.

## Safety

- Parallel packages edit one working tree. They are told to touch only
  their owned paths; the planner already forbids two packages sharing a
  file.
- Never commits, pushes, opens a PR, installs a package, migrates a
  database or touches a Docker volume.
- A blocked step or an unusable plan ends the run with a report — it
  never guesses a decision.
