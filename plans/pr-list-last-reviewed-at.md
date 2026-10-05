# Development Plan: PR list "last reviewed" relative time

## Requirement
"On the pull-request list page of a repo, show when each PR was last reviewed, as a relative time (for example "2h ago") next to the score. A PR that has never been reviewed shows a dash. The timestamp must come from the server — the time of that PR latest review — and must not be derived on the client from other data. No new filtering or sorting; display only."

Goal: add one server-provided field `last_reviewed_at` to the PR-list payload (`GET /repos/:id/pulls`), carrying the `createdAt` of the same latest review whose `score` the list already shows, and render it in a new "Reviewed" column beside the Score column. Never-reviewed PRs render a dash. This is display-only — no filtering, sorting, schema, or migration.

## Out of scope
- Any new filter chip, sort option, or change to the existing `?status`/sort query behaviour.
- Deriving the timestamp on the client from `updated_at`, runs, or any other field.
- A new DB column or migration — the value is read from the existing `reviews.createdAt`, like `score`/`cost_usd`/`finding_counts`.
- Changing the PR detail endpoint (`GET /pulls/:id`); the field is nullish and simply stays absent there.
- Touching e2e specs — the pull-list flow only waits for the "Findings" header, which remains.

## Context
- Insights applied: `client/insights.md` — 2026-09-25 — "import only *types* from `@devdigest/shared`" — the client contract edit adds only a Zod field consumed via the existing `type`-only re-export in `src/lib/types.ts`; no runtime import is added on the client.
- Insights applied: `server/insights.md` — 2026-09-17 — the seeded PR #482 demo review is now linked to a run, so it is the PR with a real latest review in the integration test; use it to assert a non-null `last_reviewed_at`.
- Constraints applied: "Shared Zod contracts live in two vendored copies … the diff must show the same change on the other side" — `.claude/skills/pr-self-review/project-rules.md` rule 3 — the `PrMeta` change is one step editing both `server/src/vendor/shared` and `client/src/vendor/shared`.
- Constraints applied: "Score shown on the PR list … is computed server-side per PR's latest review, not derived client-side" — `client/CLAUDE.md` Gotchas — `last_reviewed_at` follows the exact same pattern (server-computed, client renders only).
- Constraints applied: `@devdigest/shared`/`@devdigest/ui` are vendored copies that can drift — root `CLAUDE.md` Conventions — both `platform.ts` copies are currently identical for `PrMeta`; keep them identical.
- Constraints applied: every route goes through `getContext()` for workspace scoping — `server/CLAUDE.md` — the new field reuses the already-workspace-scoped `latestReviewByPr` query; no new query or scoping path is introduced.

## Steps
1. Add `last_reviewed_at` to the shared `PrMeta` contract in both vendored copies, identically.
   - Module: server + client (shared contract)
   - Files: modify `server/src/vendor/shared/contracts/platform.ts` · modify `client/src/vendor/shared/contracts/platform.ts`
   - Skills: zod — add `last_reviewed_at: z.string().nullish()` to the `PrMeta` object, placed immediately after `score`, with a comment matching the neighbouring list-only fields (e.g. "Timestamp of the PR's latest review (list endpoint only); null/absent until reviewed."). Both files get byte-identical edits (project-rules rule 3: contract-one-sided).
   - Depends on: none
   - Tests: `server/test/contracts.test.ts` (validates `PrMeta` shape; a nullish addition stays compatible) · no new test here — the field is covered by steps 2–3.
   - Done when: `grep -n "last_reviewed_at" server/src/vendor/shared/contracts/platform.ts client/src/vendor/shared/contracts/platform.ts` shows the same line in both files, and `pnpm typecheck` passes in `server/` and `client/`.

2. Populate `last_reviewed_at` in the list route from the latest review's `createdAt`.
   - Module: server
   - Files: modify `server/src/modules/pulls/routes.ts`
   - Skills: onion-architecture, typescript-expert, fastify-best-practices — extend the existing `latestReviewByPr` block (currently `Map<string, { score: number | null }>`): add `createdAt: t.reviews.createdAt` to its `.select({ prId, score })`, widen the map value to `{ score, createdAt }`, and set it in the same "first seen per PR is the latest review" loop. In the response `rows.map`, add `last_reviewed_at: review ? review.createdAt.toISOString() : null` next to the existing `score`. `createdAt` is `timestamptz … notNull` (`server/src/db/schema/_shared.ts` `now()`), so `.toISOString()` is safe. Reuse the existing query only — do not add a new query or a workspace filter the neighbours don't have (the query is already scoped via `prIds` from the workspace-scoped repo).
   - Depends on: step 1
   - Tests: extend `server/test/integration.it.test.ts` in the existing `GET /repos/:id/pulls returns per-severity finding_counts` test (or a sibling `it` in the same file): assert `typeof pr482.last_reviewed_at === 'string'` and `!Number.isNaN(Date.parse(pr482.last_reviewed_at))` for the seeded, review-linked PR #482, and assert `last_reviewed_at` is `null` for a PR that has no `kind: 'review'` review row.
   - Done when: the integration test above passes — a reviewed PR returns an ISO string and a never-reviewed PR returns `null` for `last_reviewed_at`.

3. Add the "Reviewed" column to the PR list and render the relative time beside Score.
   - Module: client
   - Files: modify `client/src/app/repos/[repoId]/pulls/constants.ts` · modify `client/src/app/repos/[repoId]/pulls/styles.ts` · modify `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx` · modify `client/messages/en/prReview.json`
   - Skills: react-best-practices, frontend-ui-architecture, typescript-expert, next-best-practices — in `constants.ts`, insert `"reviewed"` into `COLUMN_KEYS` right after `"score"`, and add a matching column width to `GRID` after the score column (e.g. `"1fr 132px 92px 60px 78px 132px 118px 76px 78px"`, the new `78px` after the `60px` score column). In `styles.ts`, add a `reviewedCell` style (`fontSize: 12, color: "var(--text-muted)"`, left-aligned). In `PRRow.tsx`, add a cell immediately after `scoreCell` rendering `relativeTime(pr.last_reviewed_at)` (the existing `relativeTime` helper already returns `"—"` for null/invalid, satisfying the dash requirement — reuse it, do not add a new formatter). In `prReview.json` under `list.columns`, add `"reviewed": "Reviewed"`. Keep GRID/COLUMN_KEYS in `constants.ts` and rendering in `PRRow.tsx` separate per frontend-ui-architecture placement rules. The header auto-renders from `COLUMN_KEYS` in `page.tsx` (only the last column is right-aligned), so no `page.tsx` change is needed.
   - Depends on: step 1 (type), step 2 (data)
   - Tests: create `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.test.tsx` — following `FindingCounts.test.tsx` (wrap in `NextIntlClientProvider` with `messages/en/prReview.json`) and mocking `next/navigation`'s `useRouter` as `RunReviewDropdown.test.tsx` does; assert a PR with `last_reviewed_at` set shows its relative time (e.g. `"2h"`), and a PR with `last_reviewed_at: null` renders `"—"` in the reviewed cell.
   - Skills (test file): react-testing-library
   - Done when: `pnpm test` in `client/` passes `PRRow.test.tsx`, `pnpm typecheck` passes, and the list page shows a "Reviewed" column with a relative time for reviewed PRs and "—" for never-reviewed ones.

## Contracts and data
- Zod contract (both vendored copies, identical): `PrMeta` gains
  `last_reviewed_at: z.string().nullish()` (ISO-8601 string; `null`/absent until the PR has a `kind: 'review'` review). No other contract changes.
- DB schema / migration: none — value read from existing `reviews.createdAt`.
- Endpoints: `GET /repos/:id/pulls` response objects gain `last_reviewed_at`; no new endpoint, no request-shape change.

## Verification
- Modules to typecheck and test: `server` (`pnpm typecheck`, `pnpm test` incl. the `.it.test.ts`), `client` (`pnpm typecheck`, `pnpm test`).
- Extra checks: client production build (`pnpm build` in `client/`) — the client insights note that a runtime import from `@devdigest/shared` breaks `pnpm build` though `tsc`/vitest pass; this plan adds only a type usage, so the build confirms no accidental runtime import crept in. No `db:generate` (no schema change). No e2e change expected (pull-list flow only waits for the "Findings" header).

## Open questions
- Literal "ago" suffix — assumed: reuse the existing `relativeTime` helper, which renders `"2h"`/`"2d"` (no "ago" suffix) and `"—"` for null, matching the adjacent "Updated" column exactly; the requirement's `"2h ago"` is read as an illustrative format, and consistency with the sibling column wins. If the literal suffix is wanted, add a sibling helper rather than changing `relativeTime` (it is shared with the Updated column). — affects: step 3.

## For reviewers
- Architecture: confirm the server reuses the existing `latestReviewByPr` query (no second query, no new workspace-scoping path) and that `last_reviewed_at` is taken from the *same* review row as `score`, so the two can never disagree.
- Contract: verify both `vendor/shared/contracts/platform.ts` copies changed identically (project-rules rule 3), and the client consumes the field via the existing `type`-only re-export (no runtime import from `@devdigest/shared`).
- Security: no new input, endpoint, or outbound request — this is an added read-only output field; nothing security-relevant to audit here.
