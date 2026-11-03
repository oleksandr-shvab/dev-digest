# Design analysis checklist

Run the user's description and screenshots through every block. Each hit
becomes a blocking question, a proposal `P-n`, a research question, a
`[NEEDS CLARIFICATION]`, or nothing when it is already answered (SKILL.md,
Step 3).

## States the design may not show

- **Empty** — first use, no data yet (no repos, no PRs, no findings, repo
  not indexed). What does the user see and what is the one next action?
- **Loading** — what is shown while data arrives; for anything over ~1 s,
  is there progress or only a spinner?
- **Long-running** — review runs, indexing, LLM generation: can the user
  leave and come back, and what do they see then?
- **Error** — API down, LLM provider error, timeout, quota, missing API
  key, GitHub rate limit. Which message, and is there a retry?
- **Partial** — some agents in a multi-agent run failed, some files left
  out by a token budget, index only partly built.
- **Stale** — data computed against an older PR head commit or an index
  built at an older commit; is staleness shown? (Index status is `full`,
  `partial`, `degraded` or `failed`.)
- **Large** — very long titles, hundreds of findings, thousands of files,
  huge diffs: truncation, paging, virtualisation, what is cut.
- **Zero vs. unknown** — "0 findings" differs from "not reviewed yet" and
  from "review failed"; cost `$0.00` differs from "unknown price".

## Repeated and concurrent actions

- Double-click / double-submit on anything that starts a run or writes.
- The same action from two tabs, or from the UI and the MCP server at once.
- A new action while the previous run is still going (cancel, queue, or
  refuse?).
- Navigating away mid-action; browser back after an action.

## Preconditions and permissions

- Repo not synced or not indexed; PR closed, merged, or force-pushed.
- No LLM API key, or the chosen model has no price in the price book.
- Workspace membership: who may run, accept, dismiss, delete.
- Review is never automatic: anything that looks like "run on open" or
  "run on import" contradicts the root `CLAUDE.md`.

## Accessibility (WCAG 2.2 AA minimum)

- Every action reachable and operable by keyboard, in a sensible order.
- Focus after an action: where does it land after a dialog closes, a row
  is dismissed, a run finishes?
- Icon-only buttons and badges have a text label.
- Status is not conveyed by colour alone (severity colours need text or
  icon too); contrast at least 4.5:1 for text.
- Asynchronous status changes (run finished, error) announced through a
  live region.
- Respect reduced motion for animations.

## Cross-module communication

- For every value on screen: which module produces it, which consumes it,
  and what the consumer shows when the producer fails, is slow, or returns
  nothing.
- Does a shared Zod contract change? It lives twice —
  `server/src/vendor/shared` and `client/src/vendor/shared` — and both
  copies must change together.
- Should the MCP server (`mcp-server/`) expose the same data to Claude
  Code? If yes, what does the tool return when the data is missing?
- Does `reviewer-core` need new input? It stays pure (no I/O), so the
  input must arrive from `server`.
- Does the result need to survive a reload (stored) or is it recomputed?

## UX improvements to look for

- Fewer steps to the main outcome; the primary action is obvious.
- An empty state that teaches the next step instead of a blank area.
- Undo instead of a confirm dialog for reversible actions.
- Keeping the user's place: filters, scroll, selected tab after reload.
- Feedback for slow work: progress, elapsed time, what is happening.
- Consistency with existing screens: same words, same placement, same
  severity colours.
- Showing cost and duration where the user pays for a model call.
