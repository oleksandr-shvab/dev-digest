# Smart Diff (server)

`GET /pulls/:id/smart-diff` returns a PR's files grouped by role, with the
lines that carry an open review finding. Companion UI spec:
[`client/specs/smart-diff.md`](../../client/specs/smart-diff.md). Plan and
open questions: [`plans/smart-diff.md`](../../plans/smart-diff.md).

## Endpoint

- Reviews module: [`routes.ts`](../src/modules/reviews/routes.ts) →
  `ReviewService.smartDiff` ([`service.ts`](../src/modules/reviews/service.ts)).
- Params: `IdParams` (uuid, otherwise 422). Workspace-scoped through
  `ReviewRepository.getPull` before any read; unknown PR → 404
  `Pull request not found`.
- Response 200: `SmartDiffResponse` (= `SmartDiff`), validated by the route's
  `response` schema. Always five groups, in display order `core`, `tests`,
  `wiring`, `docs`, `boilerplate`, even when empty. `SmartDiffRole` has the
  same five values in both vendored `brief.ts` copies.
- **No LLM call and no GitHub call.** It reads `pr_files`, `reviews` and
  `findings` only. `pseudocode_summary` is absent.
- `split_suggestion` is minimal: `{ too_big: false, total_lines, proposed_splits: [] }`
  with `total_lines` = sum of `additions + deletions`.

## Classification

`classifyFile(path)` ([`classify.ts`](../src/modules/reviews/smart-diff/classify.ts)) is
pure. Rules and their order live in
[`constants.ts`](../src/modules/reviews/smart-diff/constants.ts) (`ROLE_RULES`,
the source of truth): the first match wins, checked boilerplate → tests →
wiring → docs; everything else is `core`. Path→role table, including three
disputed rows, is pinned in
[`reviews-smart-diff.test.ts`](../test/reviews-smart-diff.test.ts):
`src/__tests__/__snapshots__/x.snap` → boilerplate, `.claude/skills/security/SKILL.md`
→ wiring, `e2e/README.md` → tests. `dist/**` and `build/**` are root-anchored.

## Findings on a file

`finding_lines` = ascending, de-duplicated `start_line` of findings on the
file's path that are not dismissed (`dismissed_at` null), taken from the
**latest review per agent**: the newest `kind: 'review'` review of each
`agent_id` (null counts as one agent) — `pickLatestReviewPerAgent`
([`build.ts`](../src/modules/reviews/smart-diff/build.ts)). Per agent, because
"Run all" makes one review per agent and a re-run supersedes the older pass.
The client has a twin of this function (`DiffTab/helpers.ts`); both tests pin
the same cases.

## Tests

- [`reviews-smart-diff.test.ts`](../test/reviews-smart-diff.test.ts): `classifyFile`
  table, `buildSmartDiff`, `pickLatestReviewPerAgent`.
- [`reviews-smart-diff.it.test.ts`](../test/reviews-smart-diff.it.test.ts): seeded PR
  #482 over Testcontainers — contract parse, role order, `finding_lines`
  `[12]` / `[45]`, `total_lines` 134, no model call, dismissed findings
  dropped, 404 and 422.
- [`contracts.test.ts`](../test/contracts.test.ts): the five-role `SmartDiffRole`.
