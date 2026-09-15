# Run cost attribution

Persist the USD cost of every agent run and expose it on the three reads the
UI needs: the PR list, a PR's run timeline, and a run's trace.

Companion UI spec: [`client/specs/cost-visibility.md`](../../client/specs/cost-visibility.md).

## Background

Cost was surfaced end-to-end until it was removed on purpose:

- `d45ab0d` — dropped `agent_runs.cost_usd` (migration `0009`), `cost_usd` from
  `RunStats`/`RunSummary`, and stopped populating cost in `run-executor` /
  `run.repo`.
- `58c6ac7` — dropped the `{tok} tok · $cost` line from the timeline rows.

What survived and is reused as-is:

- `reviewer-core` already sums cost per run — `ReviewOutcome.costUsd`
  ([`reviewer-core/src/review/run.ts`](../../reviewer-core/src/review/run.ts)).
  It is `null` when any single LLM call had unknown pricing (null poisons the
  sum by design), and a per-call number otherwise.
- Per-call cost comes from the provider adapters: OpenRouter reports real cost
  from the API and falls back to an injected estimator
  ([`reviewer-core/src/llm/openrouter.ts`](../../reviewer-core/src/llm/openrouter.ts));
  OpenAI/Anthropic estimate from the static table
  ([`server/src/adapters/llm/pricing.ts`](../src/adapters/llm/pricing.ts));
  `PriceBook` ([`server/src/platform/price-book.ts`](../src/platform/price-book.ts))
  overlays live OpenRouter prices.

So this feature does **not** compute cost. It stores what the engine already
returns, and aggregates it.

## Decisions

1. **Cost is stored, not derived on read.** `agent_runs.cost_usd` is written
   once when the run completes, so the number reflects the price that was in
   force at run time. Prices drift (`PriceBook` refreshes every 6h); a derived
   figure would silently rewrite history.
2. **Runs of one review trigger are grouped by a batch row.** The PR-list COST
   column is "what the latest review cost", which for a multi-agent run is the
   sum over every agent in that trigger. `multi_agent_runs` already exists in
   the schema but was never written to; this feature starts writing it and adds
   the FK from `agent_runs`. No time-window heuristic.

## Data model

Migration `0010` (generated via `pnpm db:generate` — never hand-written):

```
agent_runs
  + cost_usd            double precision NULL   -- USD for this run; NULL = unknown
  + multi_agent_run_id  uuid NULL
      REFERENCES multi_agent_runs(id) ON DELETE SET NULL
```

`cost_usd` semantics:

| Run state                          | `cost_usd`                                  |
|------------------------------------|---------------------------------------------|
| `done`, all calls priced           | sum of per-call cost (may be `0` for free models) |
| `done`, any call with unknown price| `NULL`                                      |
| `failed` / `cancelled`             | `NULL` — tokens spent before the failure are not attributed |
| `running`                          | `NULL`                                      |

`multi_agent_run_id` is nullable: runs that predate this migration keep `NULL`
and are treated as a batch of one (see aggregation).

## Server changes

### Batch row per trigger

`ReviewService.runReview` ([`service.ts`](../src/modules/reviews/service.ts))
creates exactly one `multi_agent_runs` row per call — before the
`createAgentRun` loop — and passes its id into every run it creates. One row
per trigger regardless of how many agents the trigger fans out to (`{agentId}`
→ batch of one, `{all:true}` → batch of N).

`RunRepository.createAgentRun` gains `multiAgentRunId: string | null`.

### Cost write-back

`completeAgentRun(runId, values)` gains `costUsd?: number | null`, defaulting to
`null` (same shape as the existing `score` / `blockers` optionals).

`ReviewRunExecutor` ([`run-executor.ts`](../src/modules/reviews/run-executor.ts)):

- success path — destructure `costUsd` from the outcome and pass it to
  `completeAgentRun`, and into `trace.stats.cost_usd`;
- `failAll` + the catch path — pass `costUsd: null` explicitly;
- `traceFromBuffer` — `stats.cost_usd = null`.

### Reads

`listRunsForPull` ([`run.repo.ts`](../src/modules/reviews/repository/run.repo.ts))
maps `cost_usd: run.costUsd` onto each `RunSummary`.

`GET /repos/:id/pulls` ([`pulls/routes.ts`](../src/modules/pulls/routes.ts))
adds `cost_usd` per PR: the cost of the **latest review**, i.e. the sum over
the newest batch of runs for that PR. It follows the existing latest-score
pattern in that handler — one `IN` query plus JS grouping, no denormalization:

```
rows = SELECT pr_id, id, multi_agent_run_id, cost_usd, ran_at
       FROM agent_runs
       WHERE workspace_id = ? AND pr_id IN (…)
       ORDER BY ran_at DESC
```

For each PR, the batch key of the first (newest) row wins; the key is
`multi_agent_run_id ?? id`, so a legacy run with no batch is a batch of one.
Sum `cost_usd` over the rows sharing that key.

Aggregation rules:

- `NULL` costs are skipped, not treated as `0`. A batch of
  `[$0.0013, NULL, $0.0014]` sums to `$0.0027`.
- If **every** run in the batch has `NULL` cost → `cost_usd: null`.
- PR with no runs at all → `cost_usd: null`.
- Running / failed runs participate in batch selection (a fresh failed trigger
  is still the latest review) but contribute nothing to the sum, so a
  just-triggered review reads `null` until the first agent finishes.

## Contracts

Both vendored copies must change — `server/src/vendor/shared/` **and**
`client/src/vendor/shared/` (see root `CLAUDE.md`: they are duplicated, there
is no sync script, and they have already drifted in comments).

`contracts/trace.ts`:

```ts
export const RunStats = z.object({
  duration_ms: z.number().int(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  cost_usd: z.number().nullable(),   // restored
  findings: z.number().int(),
  grounding: z.string(),
});

export const RunSummary = z.object({
  …
  cost_usd: z.number().nullable(),   // restored
  …
});
```

`contracts/platform.ts`:

```ts
export const PrMeta = z.object({
  …
  // Latest-review score (list endpoint only; null/absent until reviewed).
  score: z.number().int().nullish(),
  // Latest-review cost in USD (list endpoint only); null when no run of that
  // review had a known price.
  cost_usd: z.number().nullish(),
});
```

`cost_usd` on `RunStats`/`RunSummary` is `nullable` (always present, matching
the pre-`d45ab0d` shape); on `PrMeta` it is `nullish` because `PrMeta` is also
the GitHub-adapter shape, where no cost exists.

## Acceptance criteria

1. A completed review run has a non-null `agent_runs.cost_usd` for a
   priced model, and `NULL` for a model missing from both `PriceBook` and the
   static table.
2. `POST /pulls/:id/review {all:true}` with N enabled agents creates exactly
   one `multi_agent_runs` row, and all N `agent_runs` rows reference it.
3. `GET /pulls/:id/runs` returns `cost_usd` per run, `null` for
   failed/cancelled/running.
4. `GET /runs/:id/trace` returns `stats.cost_usd`.
5. `GET /repos/:id/pulls` returns, per PR, the sum of the newest batch —
   verified for: multi-agent batch (sum > any single run), single-agent run,
   a batch where one run has `NULL` cost, a PR with no runs (`null`), and a PR
   whose newest batch is entirely failed (`null`).
6. Re-running a review changes the PR's `cost_usd` to the new batch's sum — it
   does not accumulate across triggers.
7. Deleting a run (`deleteAgentRun`) drops it from the sum; deleting the last
   run of a PR returns the PR to `null`.

## Out of scope

- The eval/CI cost plumbing (`eval_runs.cost_usd`, `ci_runs.cost_usd`) and the
  `total_cost_usd` / `avg_cost_usd` fields in the observability and
  productionize contracts. They are untouched by this feature.
- Budgets, caps, or cost-based alerting.
- Backfilling `cost_usd` for runs that already exist in the DB — they stay
  `NULL` and render as "—".
