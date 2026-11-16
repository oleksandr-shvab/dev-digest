# Skill evals

The runner for the evals that ship inside each skill. The cases and fixtures
live in the skill, so they travel with it:

```
.claude/skills/<skill>/evals/
├── eval.md                  # what is tested and how to read the score (for people)
├── expected-findings.json   # cases, prompts, planted findings, graded checks (source of truth)
└── fixtures/                # code under review, grouped by layer
```

See `.claude/skills/onion-architecture/evals/eval.md` for a worked example and
the `expected-findings.json` fields.

Everything else lives here:

| Path | What | Committed |
|---|---|---|
| `build-suite.mjs` | turns `expected-findings.json` + `fixtures/` into a `claude plugin eval` suite | yes |
| `run.sh` | builds the suite and runs it with and without the skill | yes |
| `build/<skill>/` | the generated suite: the skill's files without `evals/` + one case folder per case | no |
| `results/<skill>/<timestamp>/` | `result.json`, `report.html` | no |
| `workspace/<skill>/iteration-N/` | skill-creator iterations: outputs, grading, `benchmark.json`, `review.html` | no |

`build/` copies the skill **without** its `evals/`, so the run under test can't
read the expected findings. Each case's fixtures are copied to their real repo
paths (`fixtureRoots`), so the reviewer sees `server/src/...`, not `fixtures/...`.

## Run

```sh
.claude/skill-evals/run.sh onion-architecture                     # all cases, 1 run each
RUNS=3 .claude/skill-evals/run.sh onion-architecture              # 3 runs per case
.claude/skill-evals/run.sh onion-architecture --case 'review-tags-*'
```

These are real, billed runs. `THRESHOLD` (default `1.0`) makes the command exit
1 when any case scores below it, which is the hook for CI; there also pass
`--trust-plugin`. Reports stay local (`--no-publish`).

To check a suite loads without spending anything:

```sh
claude plugin eval "$(node .claude/skill-evals/build-suite.mjs onion-architecture)" \
  --trust-plugin --no-publish --scaffold --allow-tools Write --max-cost-usd 0
```
