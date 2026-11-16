# onion-architecture evals

Checks that the skill makes a reviewer find layering violations in devdigest's
backend, rate them by the skill's severity scale, and leave clean files alone.
Each case is run with and without the skill.

## Layout

```
evals/
├── eval.md                  # this file
├── expected-findings.json   # cases, prompts, planted findings, graded checks
└── fixtures/                # code under review, grouped by layer
    ├── modules/             # → server/src/modules
    ├── adapters/            # → server/src/adapters
    └── reviewer-core/       # → reviewer-core/src
```

`expected-findings.json` is the single source of truth. Each case lists the
fixture files it reviews, the planted findings (file, lines, rule, expected
severity, graded assertion), and the files that must **not** be flagged. At run
time the files are copied to their real repo paths (`fixtureRoots`), so the
reviewer sees `server/src/modules/tags/routes.ts`, not `fixtures/modules/...`.

## Cases

| Case | Fixtures | Planted findings | Must not flag |
|---|---|---|---|
| `review-tags-module` | `modules/tags/*` | route queries the DB directly · service constructs `OctokitGitHubClient` · service builds a Drizzle query | `repository.ts` |
| `review-reviewer-core-changes` | `reviewer-core/**` | `node:fs` read in the core · core imports `server/src` · direct `new OpenAI(process.env…)` | `budget.ts` |
| `review-llm-spend-cap` | `adapters/llm/*`, `modules/usage/*` | adapter does persistence and budget decisions · anemic `UsageService` · route holds pricing logic and constructs a concrete tokenizer | `repository.ts` |
| `review-digest-module` | `modules/digest/*` | new `ReviewRepository` in the service · new `AgentsService` in the service · repository queries the reviews/findings tables | `routes.ts` (two chained service calls may count as MEDIUM), the pure-helper import |
| `review-alerts-module` (hard, 13 files) | `modules/alerts/*`, `modules/incidents/stats.ts`, `adapters/slack/*`, `vendor/shared/notifier.ts` | concrete adapter built in a helper two hops from the service · Drizzle in a helper · port returns Slack SDK types · alerts↔incidents module cycle through pure helpers · route builds the adapter | `repository.ts`, the Slack adapter, `container.reviewRepo` use, pure helpers |

Every case also checks that each problem in the main findings list has a severity.

## Scoring

One point per assertion: each planted finding, each must-not-flag file, each
extra check, plus the common checks. A case passes at 100%. The interesting
number is the with-skill vs without-skill delta. The baseline still reads the
repo's `CLAUDE.md` files, so violations of rules already written there say
little about the skill.

## Fixture rules

- No comment in a fixture hints at a planted problem.
- Must-not-flag files are truly clean. A real problem in one grades the
  fixture, not the skill.
- Fixtures are never compiled or linted. They sit outside every `tsconfig`.
- Planted lines in `expected-findings.json` must match the fixture after any edit.

## Run

The runner lives outside the skill, in `.claude/skill-evals/`. It builds a
`claude plugin eval` suite from `expected-findings.json` and runs it:

```sh
.claude/skill-evals/run.sh onion-architecture
RUNS=3 THRESHOLD=0.8 .claude/skill-evals/run.sh onion-architecture --case 'review-tags-*'
```
