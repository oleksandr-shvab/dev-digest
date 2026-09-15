# Cost visibility

Show what a review cost on the three surfaces where the question comes up: the
PR list, the run timeline on a PR, and a single run's trace drawer.

Data contract + server behaviour:
[`server/specs/run-cost-attribution.md`](../../server/specs/run-cost-attribution.md).

## Shared formatter

One helper, `formatUsd`, in a new `client/src/lib/cost.ts` — all three surfaces
import it. (The old `formatCost` lived inside the trace drawer's `helpers.ts`
and was removed in `d45ab0d`; cost is now needed on two different routes, so it
moves up to `lib/`.)

```
formatUsd(v: number | null | undefined): string
```

| Input      | Output       | Why                                                |
|------------|--------------|----------------------------------------------------|
| `null` / `undefined` | `—`      | unknown price / no runs — never a misleading `$0.00` |
| `0`        | `$0.00`      | free model; a real, known zero                      |
| `0.00003`  | `<$0.0001`   | non-zero but below display precision                |
| `0.0013`   | `$0.0013`    | 4 decimals max                                      |
| `0.014`    | `$0.014`     | trailing zeros trimmed                              |
| `0.06`     | `$0.06`      | trailing zeros trimmed, min 2 decimals              |
| `1.5`      | `$1.50`      | min 2 decimals                                      |

Rule: fix to 4 decimals, trim trailing zeros, pad back to at least 2. This
reproduces every value in the design (`$0.014`, `$0.041`, `$0.003`, `$0.0013`,
`$0.06`) with a single function — no per-surface precision.

## Surface 1 — PR list COST column

Route: `/repos/:repoId/pulls`.
Files: `constants.ts`, `styles.ts`, `_components/PRRow/PRRow.tsx`,
`messages/en/prReview.json`.

- New column between STATUS and UPDATED, matching the design's column order.
- `COLUMN_KEYS` gains `"cost"`; `prReview.list.columns.cost = "Cost"` (the
  header row uppercases via existing `headCell` styling).
- `GRID` becomes `"1fr 132px 92px 60px 118px 76px 78px"` — the new 76px slot
  sits before the 78px UPDATED slot. `GRID` is shared by `s.headRow` and
  `s.row`, so header and rows stay aligned by construction.
- `PRRow` renders `formatUsd(pr.cost_usd)` in a `className="mono"` cell,
  `fontSize: 12`, `color: var(--text-secondary)`; the `—` case uses `s.muted`,
  like the unreviewed SCORE cell.
- The value is the latest review's cost, not a running total for the PR.
  Column header tooltip (`title`): "Cost of the latest review".
- Skeleton loading, empty and error states are unchanged (they don't render
  cells).

## Surface 2 — timeline row

Route: `/repos/:repoId/pulls/:number`, Agent runs tab.
File: `_components/RunHistory/RunHistory.tsx`.

Restores what `58c6ac7` removed: under the run's time, a mono line with tokens
and cost.

```
                8:52:51 PM
          9,119 tok · $0.0013
```

- Rendered in the existing right-aligned column next to `ran_at`.
- `tok = (tokens_in ?? 0) + (tokens_out ?? 0)`; the line is hidden entirely
  when `tok === 0` (running rows, failed pre-work rows).
- ` · $cost` is appended only when `cost_usd != null`, so a priced-unknown run
  shows tokens alone rather than `— `.
- Commit rows are untouched.

## Surface 3 — trace drawer Stats

Route: same PR page, run trace drawer.
Files: `_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx`,
`_components/RunTraceDrawer/helpers.ts`, `messages/en/runs.json`.

Restores the fourth stat tile, between TOKENS and FINDINGS, as in the design:

```
DURATION   TOKENS       COST     FINDINGS
8.2s       15k→1.2k     $0.06    3
```

- `<Stat label={t("trace.stat.cost")} val={formatUsd(stats.cost_usd)} />`.
- `runs.json` regains `trace.stat.cost = "COST"`.
- `helpers.ts` re-exports nothing new — it imports `formatUsd` from
  `@/lib/cost` (no local `formatCost` comes back).
- The stats row is a flex row of four tiles; at narrow drawer widths it keeps
  the existing wrap behaviour.

## Acceptance criteria

1. PR list shows a COST value for every reviewed PR and `—` for PRs with no
   runs; header and row columns stay aligned at the default window width.
2. A PR reviewed by two agents in one trigger shows the sum of both runs, and
   that value is larger than either run's own cost in the timeline below.
3. A failed-only newest review shows `—` in the list, and the failed timeline
   row shows no token/cost line.
4. Re-running a review updates the list value to the new trigger's cost after
   the SSE-driven refetch (no page reload).
5. Timeline rows show `{tok} tok · ${cost}` for settled priced runs, tokens
   only for settled unpriced runs, nothing while running.
6. The trace drawer shows a COST tile whose value matches the same run's cost
   in the timeline row.
7. `formatUsd` unit tests cover every row of the table above.

## Out of scope

- A FINDINGS column in the PR list. The design mock shows one, but the server
  deliberately does not surface the per-severity breakdown on the list
  endpoint (see the comment in `server/src/modules/pulls/routes.ts`) — findings
  live on the PR detail page. Adding it is a separate feature.
- The per-row "Run Review" button and the `Auto-review: ON` / `Triage queue` /
  `Review all` header controls visible in the mock.
- Cost anywhere outside these three surfaces (Eval Dashboard, CI Runs, Agent
  Performance).
