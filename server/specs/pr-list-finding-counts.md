# PR list finding counts

Surface a per-severity findings breakdown ("N critical · N warning · N
suggestion") on the PR list, scoped to the latest review batch — the same
batch the COST column already sums.

Companion UI spec: [`client/specs/pr-list-finding-counts.md`](../../client/specs/pr-list-finding-counts.md).

## Background

Each agent run in a review trigger writes its own `reviews` row
(`kind: 'review'`, `runId` set to that run — [`run-executor.ts:218-229`](../src/modules/reviews/run-executor.ts#L218-L229))
plus its `findings` rows. There is no per-severity column anywhere:

- `agent_runs.findingsCount` / `blockers` exist but are written once at run
  completion and don't reflect later triage (accept/dismiss) —
  [`run-executor.ts:238-252`](../src/modules/reviews/run-executor.ts#L238-L252).
- The list route already explicitly excludes findings, with the comment at
  [`routes.ts:116-117`](../src/modules/pulls/routes.ts#L116-L117): *"The
  per-severity FINDINGS breakdown is intentionally not surfaced on the list
  — findings live on the PR detail page."* This feature reverses that call.

What's reused as-is:

- The "latest batch" selection rule the COST column already implements
  ([`routes.ts:132-167`](../src/modules/pulls/routes.ts#L132-L167)): newest
  `agent_runs` row per PR pins a batch key (`multi_agent_run_id ?? run.id`);
  every run sharing that key belongs to the batch.
- `rollupSeverities` in [`status.ts`](../src/modules/pulls/status.ts) — an
  existing, already-unit-tested pure tally of `{severity}` rows into
  `{critical, warning, suggestion}`. It predates this feature (unused until
  now) and is reused per-PR-group rather than duplicating a counting loop.
- `findings.severity` is plain text, always one of `'CRITICAL' | 'WARNING' |
  'SUGGESTION'` (written as-is in `review.repo.ts`), matching the vendored
  `Severity` enum in `contracts/findings.ts`.
- Triage state: `findings.dismissedAt` / `acceptedAt` timestamps.

## Decisions

1. **Derived on read, no new column, no migration.** Triage changes the count
   after the fact (dismiss/undismiss), so a stored counter would need
   invalidation on every triage action. The list is small; one extra `IN`
   query is cheap, matching the existing score/cost pattern.
2. **Same batch as COST.** The batch-selection logic (`routes.ts:146-166`) is
   extracted into a shared, pure helper so FINDINGS and COST can never
   disagree about "the latest review".
3. **Dismissed findings are excluded; accepted findings count.** Matches the
   "blockers" definition in `ReviewRunAccordion.tsx:56`
   (`f.severity === 'CRITICAL' && !f.dismissed_at`).
4. **All finding `kind`s count**, not just `kind: 'finding'` — a
   `lethal_trifecta` finding still has a real `severity` and still needs
   triage attention from the list.
5. **Reviews with no `runId`** (pre-batching legacy rows, and the seeded demo
   review) never match a batch's run ids, so they contribute nothing. This is
   consistent with COST, which only ever sums `agent_runs` rows.

## Reads

`GET /repos/:id/pulls` ([`routes.ts`](../src/modules/pulls/routes.ts)) gains a
third `IN`-query block, after the existing cost block, reusing the same
`runRows` already fetched for cost:

```sql
-- 1. Which reviews belong to the pinned batch of each PR (drives {0,0,0} vs null)
SELECT reviews.pr_id
FROM reviews
WHERE reviews.run_id IN (<run ids of every PR's pinned batch>)
  AND reviews.kind = 'review'

-- 2. Raw (ungrouped) severities over those same reviews — grouped and tallied
--    in JS via rollupSeverities, matching the existing score/cost pattern of
--    "fetch flat rows, aggregate in JS" rather than a SQL GROUP BY.
SELECT reviews.pr_id, findings.severity
FROM findings
JOIN reviews ON findings.review_id = reviews.id
WHERE reviews.run_id IN (<same run ids>)
  AND reviews.kind = 'review'
  AND findings.dismissed_at IS NULL
```

Both queries are scoped to run ids, not a raw PR-id `IN`, so a review that
belongs to an older (non-pinned) batch is never counted even though it shares
the PR.

### Aggregation semantics

| State of the PR's pinned batch                          | `finding_counts` |
|-----------------------------------------------------------|-------------------|
| PR has no runs at all                                    | `null`            |
| Batch exists but has zero `kind: 'review'` rows (every run still `running`, or `failed` before producing a review) | `null` |
| ≥1 review in the batch, zero non-dismissed findings       | `{CRITICAL: 0, WARNING: 0, SUGGESTION: 0}` |
| ≥1 review with findings                                   | sum across every review in the batch |

`null` vs `{0,0,0}` mirrors the `score`/`cost_usd` pattern: `null` means
"nothing to show yet", `{0,0,0}` means "reviewed, found nothing that survived
triage".

## Implementation

`pickLatestBatchByPr(runRows): Map<prId, RunRow[]>` — a new pure function in
`server/src/modules/pulls/latest-batch.ts` — extracts the batch-pinning loop
at `routes.ts:146-166` so both the COST sum and the new findings query call
it once on the same `runRows` result. It returns, per PR, the list of runs in
its pinned batch (COST already has the logic inline; this is a refactor of
existing behavior, not a behavior change).

`aggregateFindingCounts(reviewRows, findingRows): Map<prId, FindingCounts>` —
pure, in the same file — groups `findingRows` by PR and calls
`rollupSeverities` per group, converting its lowercase
`{critical,warning,suggestion}` shape into the uppercase `FindingCounts`
contract. Implements the semantics table above (PRs absent from the
returned map read `null` at the call site via `?? null`).

## Contract

Both vendored copies (`server/src/vendor/shared/` and
`client/src/vendor/shared/` — currently identical for `platform.ts` and
`findings.ts`, see root `CLAUDE.md`) gain, in `contracts/platform.ts`:

```ts
export const FindingCounts = z.object({
  CRITICAL: z.number().int(),
  WARNING: z.number().int(),
  SUGGESTION: z.number().int(),
});
export type FindingCounts = z.infer<typeof FindingCounts>;

export const PrMeta = z.object({
  // …
  // Per-severity, non-dismissed finding counts for the latest review batch
  // (list endpoint only; null until reviewed). Nullish because PrMeta is
  // also the GitHub-adapter shape, where no review exists yet.
  finding_counts: FindingCounts.nullish(),
});
```

## Acceptance criteria

1. A PR with no runs returns `finding_counts: null`.
2. A PR whose newest batch is entirely `running`/`failed` (no review row yet)
   returns `finding_counts: null`.
3. A PR whose latest review found findings, all since dismissed, returns
   `{CRITICAL: 0, WARNING: 0, SUGGESTION: 0}`, not `null`.
4. An accepted (not dismissed) `CRITICAL` finding counts.
5. A multi-agent batch sums findings across every agent's review in that
   trigger.
6. Findings belonging to an older, non-pinned batch for the same PR are not
   counted after a newer review supersedes it.
7. Re-running a review changes `finding_counts` to the new batch's counts —
   it does not accumulate across triggers.
8. The seeded demo PR #482 (`server/src/db/seed.ts`) returns
   `{CRITICAL: 1, WARNING: 1, SUGGESTION: 0}` once its review is linked to a
   run (see seed change below).

## Seed change

`server/src/db/seed.ts` currently inserts the PR #482 demo `reviews` row with
`runId: null` / `agentId: null`, so on a fresh DB `finding_counts` would read
`null` even though two findings are seeded. The seed is updated to link that
review to the seeded "Security Reviewer" `agent_runs` row (`runId`,
`agentId`) so the list demonstrates non-`—` counts out of the box. This only
affects a fresh seed (`seed.ts` only inserts `if (!pr)`); it is not a
migration and does not touch existing local databases.

## Out of scope

- Filtering or sorting the PR list by finding counts.
- A per-agent breakdown (which agent found what) on the list.
- Live-updating `finding_counts` the instant a finding is dismissed on the PR
  detail page — the list picks it up on its next fetch (60s poll / navigation
  back), same as `score` and `cost_usd` today.
- Counting non-`review` review rows (`kind: 'summary'`).
