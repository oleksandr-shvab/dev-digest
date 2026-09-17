# PR list finding counts

Show a per-severity findings breakdown in a new FINDINGS column on the PR
list, so a PR can be triaged without opening it.

Data contract + server behaviour:
[`server/specs/pr-list-finding-counts.md`](../../server/specs/pr-list-finding-counts.md).

This reverses the exclusion noted in
[`cost-visibility.md`](cost-visibility.md)'s "Out of scope": *"A FINDINGS
column in the PR list... Adding it is a separate feature."* — this is that
feature.

## Column

Route: `/repos/:repoId/pulls`.
Files: `constants.ts`, `styles.ts`, `_components/PRRow/PRRow.tsx`, new
`_components/FindingCounts/FindingCounts.tsx`, `messages/en/prReview.json`.

- New column placed right after SCORE (current order: PULL REQUEST, AUTHOR,
  SIZE, SCORE, **FINDINGS**, COST, STATUS, UPDATED). Matches the design mock's
  relative position of the findings cluster next to the score ring; the
  mock's own COST/STATUS column order is unchanged here (out of scope — see
  below).
- `COLUMN_KEYS` gains `"findings"` right after `"score"`.
- `GRID` gets a new `132px` slot inserted right after the SCORE slot (was
  `"1fr 132px 92px 60px 118px 76px 78px"`; SCORE is the `60px` slot). `GRID`
  is shared by `s.headRow` and `s.row`, so header and rows stay aligned by
  construction — no separate change needed for either.
- `prReview.list.columns.findings = "Findings"`;
  `columns.findingsTooltip = "Findings in the latest review (dismissed excluded)"`
  set as the header cell's `title`, matching the existing `costTooltip`
  pattern.

## `FindingCounts` component

```
FindingCounts({ counts: FindingCounts | null | undefined })
```

Rendered per design (`Pull Requests · Run Review + auto-status + Cost` mock):
a plain inline row of icon+number pairs, one per severity that has a
non-zero count, in fixed order CRITICAL → WARNING → SUGGESTION. No pill/badge
background (unlike the existing `SeverityBadge`, which is a filled chip used
elsewhere) — just the severity's icon and color from
`@devdigest/ui`'s `SEV` token map, plus a `tnum` number, with a dashed
underline (`borderBottom: "1px dashed currentColor"`) signalling the
per-item tooltip.

- `counts == null` **or** all three severities are `0` → muted `—`
  (`s.muted`), same treatment as the unreviewed SCORE cell (PR #460 in the
  design mock, which has no runs yet).
- Otherwise, only non-zero severities render (design PR #477: only
  `💡 1`, no `0` badges for CRITICAL/WARNING). Items are laid out
  `display: flex; align-items: center; gap: 8px`, no wrapping.
- Each item: `<Icon size={12} color={SEV[sev].c} />` + `<span
  className="mono">{n}</span>`, `title="{n} {label}"` (e.g. `"2 critical"`)
  for a native tooltip on hover.
- The cell itself carries `aria-label` summarizing all non-zero severities
  space-separated, e.g. `"2 critical · 2 warning · 2 suggestion"` — icon +
  color + text together satisfy WCAG (never color alone), sourced from a new
  i18n key `prReview.list.findingsSummary` (ICU, one variable per severity).
- CRITICAL uses `SEV.CRITICAL.icon` (`AlertOctagon`, already in the app's
  token map) rather than introducing a new icon to match the mock's circled
  "!" glyph exactly — reuses the existing severity vocabulary instead of a
  one-off icon.

### Mockup

```
SCORE   FINDINGS        COST
 (61)   ⛔2  ⚠2  💡2   $0.014
 (44)   ⛔1  ⚠4  💡3   $0.041
  —        —             —
 (92)         💡1        $0.003
```

## Acceptance criteria

1. A PR with `finding_counts: null` shows `—` in the FINDINGS cell.
2. A PR with `finding_counts: {0,0,0}` shows `—`, not three zero badges.
3. A PR with `{CRITICAL: 1, WARNING: 1, SUGGESTION: 0}` shows exactly two
   items (critical, warning), in that order, no suggestion item.
4. Header and row cells stay grid-aligned at the default window width after
   the new column is inserted.
5. Each rendered item's `title` and the cell's `aria-label` are correct and
   translated.
6. Re-fetching the list (poll / navigation back) after a dismiss on the PR
   detail page updates the cell to the new count.

## Out of scope

- Making the FINDINGS cell clickable / deep-linking to a filtered findings
  view on the detail page.
- The mock's COST/STATUS column reordering, the per-row "Run Review" button,
  and the `Auto-review: ON` / `Triage queue` / `Review all` header controls —
  unrelated to this feature.
- Any change to the severity badge used elsewhere (`FindingCard`,
  `FindingsPanel`) — `FindingCounts` is a new, list-specific component, not a
  variant of `SeverityBadge`.
