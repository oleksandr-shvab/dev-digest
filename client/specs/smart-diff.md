# Smart Diff (client)

The Files changed tab groups files by role and shows review findings inside
the diff. API: [`server/specs/smart-diff.md`](../../server/specs/smart-diff.md).
Plan and open questions: [`plans/smart-diff.md`](../../plans/smart-diff.md).

## Acceptance (as implemented)

**Grouping** — `DiffTab` renders one `SmartDiffGroup` per group the server
sends, in the server's order: Core, Tests, Wiring, Docs, Boilerplate. All five
always render. Docs, Boilerplate and empty groups start collapsed; inside a
group each file keeps its own auto-expand rule. A file the server did not
place goes to Core (`groupFilesByRole`). The header shows the role label,
the counter and "N files". The tab never waits for the endpoint: if smart-diff
is loading or failed, it renders the plain `DiffViewer`.

**Counter** — counts files, not findings: 2 files with 5 findings → 2
(`countFilesWithFindings`). Shown only when above 0, as a red dot plus the
number (`aria-label` "N files with findings"). Dismissed findings do not count.

**Which findings** — the newest review per agent (`pickLatestReviewPerAgent`,
twin of the server function). An older review of the same agent is not shown.

**In the diff** (shared `diff-viewer`, props via `DiffFindingApi`)
- File card header: a dot (no number, so it differs from the GitHub-comment
  counter) when the file has an open finding.
- The finding's line: a severity stripe and a label — CRITICAL "blocker",
  WARNING "warning", SUGGESTION "suggestion" (`LINE_LABEL_KEY`).
- Under the line: the shared `FindingCard` (severity, title, explanation,
  suggestion, Accept / Dismiss), expanded. Dismissed findings still render,
  muted.
- Findings whose `start_line` is not in the patch, or on a file with no patch
  text, go to an "N finding(s) outside the diff" block at the end of the file.

**Toggles** — the GitHub-comments show/hide button now also hides the finding
cards (stripe, label and dots stay) and defaults to shown. A Smart order /
Original order chip pair switches to GitHub order with no headers; it is local
state and resets on reload.

**Empty state** — before any review: "Review not run yet", no counters;
grouping still works.

## Not done

Sticky group header: `PrDetailHeader` is `position: sticky; top: 0` with a
variable height, so a sticky group header would slide under it; placing it
needs that header measured. Also not done: refreshing the counters while the
tab stays open during a run (the normal flow refreshes via the reviews cache).

## Tests

- [`DiffTab.test.tsx`](../src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.test.tsx):
  smart order, Original order, before the first review.
- [`helpers.test.ts`](../src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/helpers.test.ts):
  latest-per-agent, grouping, counter.
- [`FileCard.test.tsx`](../src/components/diff-viewer/FileCard/FileCard.test.tsx):
  dot, label, inline card, outside-the-diff block, hidden cards.
