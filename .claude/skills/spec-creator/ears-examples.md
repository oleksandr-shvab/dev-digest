# EARS examples

Criteria from DevDigest's own domain, each bad version followed by a good
one and why. The format line is the one `scripts/check-spec.mjs` parses:

`- **AC-n** · P1|P2|P3 · US-n|NFR · Verify: unit|integration|e2e|manual — <EARS statement>`

## The five patterns

| Pattern | Shape | DevDigest example |
|---|---|---|
| Ubiquitous | `The <system> shall <response>.` | The findings list shall show each finding's severity as one of CRITICAL, WARNING or SUGGESTION. |
| Event-driven | `WHEN <trigger>, the <system> shall <response>.` | WHEN the user clicks "Run review" on a PR page, the review API shall start exactly one review run for that PR. |
| State-driven | `WHILE <state>, the <system> shall <response>.` | WHILE a review run for the PR has status `running`, the PR page shall show the "Run review" button disabled with the label "Review running…". |
| Unwanted behavior | `IF <condition>, THEN the <system> shall <response>.` | IF the LLM provider returns an error, THEN the PR page shall show the run as failed with the provider's error reason and a "Retry" action. |
| Optional feature | `WHERE <feature is enabled>, the <system> shall <response>.` | WHERE the workspace has a CI fail-on severity set, the run summary shall show how many findings reached it as blockers. |

## Bad → good

**Two behaviours in one criterion**

- Bad: `WHEN the user dismisses a finding, the finding shall be hidden and the count updated.`
- Good:
  - `- **AC-4** · P1 · US-2 · Verify: integration — WHEN the user dismisses a finding, the findings list shall stop showing it under the default filter.`
  - `- **AC-5** · P1 · US-2 · Verify: integration — WHEN the user dismisses a finding, the PR list shall show that PR's open-finding count reduced by one.`
- Why: each AC must pass or fail on its own; with "and", half-done reads as done.

**Unmeasurable word**

- Bad: `The blast radius block shall load fast.`
- Good: `- **AC-9** · P2 · NFR · Verify: integration — The blast radius API shall respond within 500 ms for a PR of up to 200 changed files on an indexed repo.`
- Why: "fast" has no pass/fail. A number, a size bound and a precondition do.

**The how instead of the what**

- Bad: `WHEN a review completes, the server shall insert a row into agent_runs with cost_usd set.`
- Good: `- **AC-11** · P1 · US-3 · Verify: integration — WHEN a review run completes, the run's record shall show its cost in USD, or "unknown" when any call had no price.`
- Why: table and column names are the plan's decision. The spec says what the user can observe.

**Missing the unwanted path**

- Bad (only): `WHEN the user opens the Onboarding tab, the page shall show the reading path.`
- Add: `- **AC-14** · P1 · US-1 · Verify: e2e — IF the repository is not indexed yet, THEN the Onboarding tab shall show "Index this repository first" with an "Index now" action instead of an empty path.`
- Why: every event-driven criterion invites the question "and if the precondition is not met?".

**Vague system**

- Bad: `WHEN a finding is accepted, it shall be saved.`
- Good: `- **AC-6** · P1 · US-2 · Verify: integration — WHEN the user accepts a finding, the findings list shall show it as accepted after a page reload.`
- Why: "it shall be saved" names no system and no observation.

**IF without THEN**

- Bad: `IF the diff exceeds the token budget the review shall be truncated.`
- Good: `- **AC-8** · P1 · US-1 · Verify: unit — IF the PR diff exceeds the review's token budget, THEN the review result shall list the files it left out.`
- Why: the script rejects `IF` without `THEN`, and the good version is observable.

## Untrusted input as a criterion

- `- **AC-15** · P1 · NFR · Verify: unit — IF a PR body contains text addressed to the reviewer model (e.g. "ignore previous instructions"), THEN the review shall treat it as PR content and its findings shall still cover the whole diff.`
- `- **AC-16** · P1 · NFR · Verify: e2e — The findings list shall render a finding's title and rationale as text, so that HTML or script in model output is shown, not executed.`
