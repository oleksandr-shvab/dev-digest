# Development Plan: Smart Diff (files grouped by role, review findings inside the diff)

## Requirement
Course homework "Smart Diff" (branch `A3-hw-smart-diff`), as given in the task: the Files changed tab shows files in GitHub order and review findings live only on the Agent runs tab. Smart Diff (1) sorts PR files by role — core → tests → wiring → docs → boilerplate — using a pure path classifier (first matching rule wins, checked in the order boilerplate → tests → wiring → docs, everything else core), served by a new `GET /pulls/:id/smart-diff` that returns the existing `SmartDiff` contract; and (2) shows review results inside the diff: a files-with-findings counter on each group header, a dot on each file card with findings, and a FindingCard-style comment (severity, title, explanation, suggestion, Accept / Dismiss) under the finding's line, with a severity stripe and label on that line, plus a block at the end of the file for findings whose line is not in the patch. An "Original order" toggle restores GitHub order. P1, P2 and the cheap P3 items are in scope; no model call is added.

## Out of scope
- Any LLM / model call. `pseudocode_summary` stays absent; `split_suggestion` is the minimal `{ too_big: false, total_lines, proposed_splits: [] }`, and the existing `smartDiff.largeTitle` / `largeBody` keys are not rendered.
- Changing the Agent runs tab's behaviour. The only edit there is one import path in `FindingsPanel.tsx`, because `FindingCard` moves to `src/components/` (step 5).
- New dependencies. The classifier patterns are `RegExp`s, not a glob library.
- DB schema changes and migrations. Everything is read from the existing `pr_files`, `reviews` and `findings` tables.
- The sticky group header (P3). `PrDetailHeader` is already `position: sticky; top: 0` with a variable height (`PrDetailHeader/styles.ts`), so a sticky group header at `top: 0` would slide under it, and placing it correctly needs that header to be measured. That is not cheap.
- Refreshing the counters while the Files changed tab stays open during a run. The normal flow is covered (see step 7 and Open questions).
- Using the classifier as a pre-prompt filter (a later lesson). The plan only keeps it importable without HTTP.
- A new e2e flow. The existing `e2e/specs/05-pr-diff.flow.json` still exercises the tab and is run under Verification.
- The workflow steps after implementation are handled outside the implementer: architecture review, plan verification, `/pr-self-review`, `engineering-insights`, PR creation and the demo video.

## Context
- Insights applied: `client/insights.md` — 2026-09-25 — "Importing a runtime value (not `import type`) from `@devdigest/shared` passes `tsc` and vitest but fails `pnpm build`". Effect here: every client file imports `SmartDiff`, `SmartDiffRole`, `FindingRecord` and `ReviewRecord` with `import type` only. The client never needs the role order as a value, because it renders groups in the order the server sends. The client build is listed under Extra checks.
- Insights applied: `server/insights.md` — 2026-09-17 — "grep that module's own `*.test.ts` files too — a tested-but-unused pure function is easy to miss". I checked `server/test/pulls-latest-batch.test.ts` and `server/src/modules/pulls/latest-batch.ts`. `pickLatestBatchByPr` exists, but the client cannot reproduce batch membership because `ReviewRecord` has no `multi_agent_run_id`. That is why the plan defines the "latest review per agent" rule (Open questions 1).
- Insights applied: `server/insights.md` — 2026-09-17 and 2026-09-21 — the seeded PR #482 review is linked to the seeded Security Reviewer run. Effect here: the integration test in step 4 uses PR #482 (4 core files; findings `src/config.ts:12` CRITICAL and `src/api/users.ts:45` WARNING; none of the 4 files has a `patch`).
- Insights applied: `server/insights.md` — 2026-09-15 — `LOG_LEVEL=` (present but empty) in `server/.env` breaks every `*.it.test.ts`. Effect here: Verification warns about it.
- Insights applied: root `insights.md` — 2026-09-24 — run pnpm scripts with `npm_config_verify_deps_before_run=false` so an implicit install does not masquerade as a test failure. Effect here: every command in this plan sets it.
- Insights applied: root `insights.md` — 2026-09-21 — `dev-digest/` is a nested clone. Effect here: ignore any match under it.
- Constraints applied: "`@devdigest/shared` … vendored copies … They can drift — check both sides when you change a shared Zod contract" — root `CLAUDE.md` — and project-rules rule 3 `contract-one-sided` — `.claude/skills/pr-self-review/project-rules.md`. Effect here: step 1 edits both `brief.ts` copies identically.
- Constraints applied: "Every route goes through `getContext()` for workspace scoping and Zod validation" — `server/CLAUDE.md` — and project-rules rule 6 `workspace-scoping`. Effect here: the new route uses `getContext` plus `IdParams`, and the service checks PR ownership through the existing workspace-scoped `ReviewRepository.getPull` before reading files or findings.
- Constraints applied: "The actual LLM call lives in `reviewer-core`" — `server/CLAUDE.md`; "GET never calls the classifier (opening the PR page must not spend tokens)" — the precedent comment in `server/src/modules/reviews/routes.ts`. Effect here: the smart-diff path never touches `container.llm`, and step 4 pins this with a test.
- Constraints applied: "Review is never auto-triggered" — root `CLAUDE.md` and project-rules rule 1. Effect here: the smart-diff route only reads.
- Constraints applied: "`src/db/migrations/*.sql` — regenerate via `pnpm db:generate`, never hand-edit" — `server/CLAUDE.md`. Not triggered: there is no schema change.
- Constraints applied: "Data fetching goes through the hooks in `src/lib/hooks/`" and "don't add a second polling mechanism" — `client/CLAUDE.md`. Effect here: a new `useSmartDiff` hook goes in `src/lib/hooks/reviews.ts`, and there is no polling.
- Constraints applied: "Promote to top-level `src/components/` only once a component is used by 2+ routes/features" — `frontend-ui-architecture`. `FindingCard` becomes used by the Agent runs tab and by the shared `diff-viewer`, so it moves to `client/src/components/finding-card/` (step 5). A shared component must not import a route-private `_components/` file.
- Constraints applied: `security` is routed by `routing.json` to almost every source file here. Following the planner rule, it is assigned only to step 4 (the new endpoint); everywhere else it is routed but not assigned.
- Constraints applied: specs convention, "Add one file per feature" — `server/specs/README.md`, `client/specs/README.md`. Effect here: step 8.

## Steps

1. Extend `SmartDiffRole` to five roles in both vendored contract copies.
   - Module: server + client (shared contract)
   - Files: modify `server/src/vendor/shared/contracts/brief.ts` · modify `client/src/vendor/shared/contracts/brief.ts` · modify `server/test/contracts.test.ts`
   - Change: replace `z.enum(['core', 'wiring', 'boilerplate'])` with `z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate'])`, written in display order, with the one-line comment `// Display order of Smart Diff groups.` above it. Make byte-identical edits in both files. Nothing else in either file changes. In `contracts.test.ts`, extend the existing `it('SmartDiff (data.jsx DIFF)')` so that it also parses a group with `role: 'tests'` and one with `role: 'docs'`, and add `expect(() => SmartDiffRole.parse('docs')).not.toThrow()` (import `SmartDiffRole` next to `SmartDiff`).
   - Skills: zod — `schema-use-enums` (a fixed set of strings stays a `z.enum`, and the inferred type follows via `z.infer`); project-rules rule 3 (both sides in the same diff). `contracts.test.ts`: none routed.
   - Depends on: none
   - Tests: `server/test/contracts.test.ts` (extended as above)
   - Done when: `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` prints nothing; `cd server && npm_config_verify_deps_before_run=false pnpm exec vitest run test/contracts.test.ts` passes; `pnpm typecheck` passes in `server/` and `client/`.

2. Add the pure path classifier `classifyFile`, with its path→role test table written first.
   - Module: server
   - Files: create `server/test/reviews-smart-diff.test.ts` (first) · create `server/src/modules/reviews/smart-diff/constants.ts` · create `server/src/modules/reviews/smart-diff/classify.ts`
   - Change:
     - Placement: a `smart-diff/` sub-folder of the `reviews` module, following the existing sub-folder precedent `reviews/repository/` and `skills/import/`. The service that will use it later (`run-executor.ts`, for the pre-prompt filter) lives in the same module. Both files are pure: no Fastify, DB or `container` imports, only `import type { SmartDiffRole } from '@devdigest/shared'`.
     - `constants.ts` exports:
       - `SMART_DIFF_ROLE_ORDER: readonly SmartDiffRole[] = ['core', 'tests', 'wiring', 'docs', 'boilerplate']` (the display order).
       - `FALLBACK_ROLE: SmartDiffRole = 'core'`.
       - `ROLE_RULES: readonly { role: Exclude<SmartDiffRole, 'core'>; patterns: readonly RegExp[] }[]` in check order boilerplate → tests → wiring → docs, with a comment that the order is load-bearing (first match wins) and that the three disputed cases are pinned in `server/test/reviews-smart-diff.test.ts`. Each pattern is matched against the repo-relative, forward-slash path and has its glob in a trailing comment:
         - boilerplate: `/\.lock$/` (`*.lock`), `/(^|\/)pnpm-lock\.yaml$/`, `/(^|\/)package-lock\.json$/`, `/(^|\/)yarn\.lock$/`, `/^dist\//` (`dist/**`), `/^build\//` (`build/**`), `/(^|\/)__snapshots__\//`, `/\.snap$/`, `/(^|\/)[^/]*\.generated\.[^/]+$/` (`*.generated.*`), `/\.min\.js$/`.
         - tests: `/\.test\.tsx?$/` (`*.test.ts(x)`; it also covers `*.it.test.ts`, say so in the comment), `/\.spec\.ts$/`, `/(^|\/)tests?\//` (`**/test/**`, `**/tests/**`), `/(^|\/)__tests__\//`, `/^e2e\//`.
         - wiring: `/(^|\/)index\.(ts|js)$/` (barrels), `/(^|\/)[^/]*\.config\.[^/]+$/` (`*.config.*`), `/(^|\/)tsconfig[^/]*\.json$/`, `/(^|\/)\.eslintrc[^/]*$/`, `/(^|\/)\.env[^/]*$/`, `/(^|\/)docker-compose[^/]*\.yml$/`, `/^\.github\//`, `/^\.claude\//`.
         - docs: `/\.md$/`, `/^docs\//`, `/(^|\/)README[^/]*$/`, `/(^|\/)CHANGELOG[^/]*$/`, `/(^|\/)LICENSE$/`.
     - `classify.ts` exports `classifyFile(path: string): SmartDiffRole`: it walks `ROLE_RULES` in order, returns the first rule whose pattern tests true, and otherwise returns `FALLBACK_ROLE`.
     - Test file: `describe('classifyFile')` with `it.each` over a `[path, role]` table that includes at least the following rows:
       - the three disputed cases: `src/__tests__/__snapshots__/x.snap` → `boilerplate`; `.claude/skills/security/SKILL.md` → `wiring`; `e2e/README.md` → `tests`;
       - boilerplate: `pnpm-lock.yaml`, `client/pnpm-lock.yaml`, `yarn.lock`, `Cargo.lock`, `dist/index.js` (boilerplate beats the wiring barrel), `src/api.generated.ts`, `public/vendor.min.js`;
       - tests: `server/test/integration.it.test.ts`, `client/src/A/A.test.tsx`, `src/a.spec.ts`, `src/__tests__/a.ts`, `e2e/specs/05-pr-diff.flow.json`;
       - wiring: `server/src/modules/index.ts`, `client/next.config.ts`, `server/tsconfig.json`, `.eslintrc.json`, `.env.example`, `docker-compose.yml`, `.github/workflows/ci.yml`;
       - docs: `README.md`, `server/specs/smart-diff.md`, `docs/agent-prompts/x.txt`, `CHANGELOG`, `LICENSE`;
       - core: `src/config.ts` (pins that `config.ts` is not `*.config.*`), `src/middleware/ratelimit.ts`, `server/src/modules/reviews/service.ts`.

       Add a comment above the disputed rows: if the team decides otherwise, change the rule and this row together.
   - Skills: onion-architecture, typescript-expert — the classifier is inner-ring pure logic with no HTTP or DB dependency, so a later lesson can call it from `run-executor.ts` without the route; `readonly` typing for the rule table. `server/test/reviews-smart-diff.test.ts`: none routed.
   - Depends on: step 1 (the `SmartDiffRole` type must include `tests` and `docs`)
   - Tests: create `server/test/reviews-smart-diff.test.ts` (the table above, written before `classify.ts`)
   - Done when: `cd server && npm_config_verify_deps_before_run=false pnpm exec vitest run test/reviews-smart-diff.test.ts` passes every row of the table.

3. Add the pure `buildSmartDiff` and `pickLatestReviewPerAgent` functions that turn PR files and findings into a `SmartDiff`.
   - Module: server
   - Files: create `server/src/modules/reviews/smart-diff/build.ts` · modify `server/test/reviews-smart-diff.test.ts`
   - Change: `build.ts` (pure; type imports only from `@devdigest/shared` and `../repository.js`) exports:
     - `pickLatestReviewPerAgent<T extends { review: Pick<ReviewRow, 'kind' | 'agentId'> }>(rowsNewestFirst: T[]): T[]`. It keeps only rows with `review.kind === 'review'` and, per `review.agentId`, only the first (newest) one. A `null` `agentId` counts as one agent. The doc comment states the precondition (input newest-first, as `ReviewRepository.reviewsForPull` returns it) and why the rule is per agent: "Run all" produces one review per agent, and re-running an agent supersedes its older pass.
     - `buildSmartDiff(files: SmartDiffSourceFile[], findings: SmartDiffSourceFinding[]): SmartDiff`, with `SmartDiffSourceFile = { path: string; additions: number; deletions: number }` and `SmartDiffSourceFinding = { file: string; startLine: number; dismissedAt: Date | null }`. Both are structurally satisfied by the `pr_files` and `findings` rows. It works as follows:
       - It returns one group per role in `SMART_DIFF_ROLE_ORDER`, always all five even when `files` is empty. Each group holds the files that `classifyFile` puts in that role, in input order.
       - Each file is `{ path, additions, deletions, finding_lines }`, where `finding_lines` = the ascending, de-duplicated `startLine`s of findings with `file === path` and `dismissedAt === null`. Anchor to `start_line`; there is no `line` field.
       - `split_suggestion = { too_big: false, total_lines: Σ(additions + deletions), proposed_splits: [] }`.
       - It does not set `pseudocode_summary`.
     - Test file: add `describe('buildSmartDiff')`, covering four cases:
       1. five groups in the order core, tests, wiring, docs, boilerplate even for `[]` files (grouping works before any review);
       2. a lock file lands in boilerplate, while within a group input order is kept;
       3. `finding_lines` is sorted and de-duplicated, ignores dismissed findings and ignores findings on other paths (2 files with 5 findings → exactly those 2 files have non-empty `finding_lines`);
       4. `total_lines` is the sum.

       Add `describe('pickLatestReviewPerAgent')`, covering three cases:
       1. two agents → both newest reviews kept;
       2. the same agent twice → only the newest kept;
       3. `kind: 'summary'` dropped, and `null` agents collapse to one.
   - Skills: onion-architecture, typescript-expert — pure functions over plain shapes, with no I/O in the builder; explicit generic constraint instead of `any`. `server/test/reviews-smart-diff.test.ts`: none routed.
   - Depends on: step 2
   - Tests: `server/test/reviews-smart-diff.test.ts` (extended as above)
   - Done when: `cd server && npm_config_verify_deps_before_run=false pnpm exec vitest run test/reviews-smart-diff.test.ts` passes all three describe blocks.

4. Serve `GET /pulls/:id/smart-diff` through `ReviewService`, with a Zod-validated response.
   - Module: server
   - Files: modify `server/src/modules/reviews/service.ts` · modify `server/src/modules/reviews/routes.ts` · create `server/test/reviews-smart-diff.it.test.ts`
   - Change:
     - `service.ts`: add `async smartDiff(workspaceId: string, prId: string): Promise<SmartDiffResponse>` under "Reads":
       - `const pull = await this.repo.getPull(workspaceId, prId)`; when it is missing, throw `NotFoundError('Pull request not found')`. This mirrors `reviewsForPull`.
       - Then `const files = await this.repo.getPrFiles(prId)` and `const rows = await this.repo.reviewsForPull(prId)`.
       - Return `buildSmartDiff(files, pickLatestReviewPerAgent(rows).flatMap((r) => r.findings))`.
       - No `container.llm`, no GitHub call (it reads the `pr_files` that `GET /pulls/:id` already refreshed), and no new repository method.
     - `routes.ts`:
       - Add `app.get('/pulls/:id/smart-diff', { schema: { params: IdParams, response: { 200: SmartDiffResponse } } }, async (req) => { const { workspaceId } = await getContext(container, req); return service.smartDiff(workspaceId, req.params.id); })` under "Reads", next to `/pulls/:id/reviews`.
       - Import `SmartDiffResponse` (value) from `@devdigest/shared`.
       - Above the route, add the comment `// GET never calls a model: grouping is a path classifier, findings come from persisted reviews.`
       - Add the route to the module's header doc list: `GET /pulls/:id/smart-diff → files grouped by role + finding lines (no LLM)`.
       - The response schema is what makes "the route response validates against the SmartDiff contract" hold at runtime: `serializerCompiler` is already set in `server/src/app.ts:65`.
     - `reviews-smart-diff.it.test.ts`: follow `server/test/integration.it.test.ts`. That means `startPg()`, `seed(db)`, and `buildApp({ config, db, overrides: { git: new MockGitClient(), github: new MockGitHubClient(), llm: { openai: llmMock } } })` with `const llmMock = new MockLLMProvider('openai')`; get the PR #482 id by selecting `t.pullRequests` where `number = 482`. Cases:
       1. 200, and `SmartDiffResponse.parse(body)` succeeds; the roles come back in order `['core','tests','wiring','docs','boilerplate']`; the core group has the 4 seeded paths; `src/config.ts` has `finding_lines` `[12]` and `src/api/users.ts` has `[45]`; the other 4 groups are empty; `split_suggestion` equals `{ too_big: false, total_lines: 134, proposed_splits: [] }`; and `llmMock.calls` is empty.
       2. After setting `dismissedAt` on the seeded WARNING finding, `src/api/users.ts` has `finding_lines` `[]`.
       3. A random uuid gives 404, and `/pulls/not-a-uuid/smart-diff` gives 422.
   - Skills: onion-architecture, typescript-expert, fastify-best-practices, security
     - onion "Thin Routes": the route only does `getContext` → service → return.
     - onion "Repository Owns Persistence": the service calls only existing repository methods.
     - fastify "Schema-first": `params` and `response` schemas on the route.
     - security A01: the workspace-scoped `getPull` runs before any file or finding read, so another workspace's PR returns 404; `IdParams` rejects non-uuid ids.
     - `reviews-smart-diff.it.test.ts`: fastify-best-practices (`app.inject`).
     - `service.ts` has no fastify skill (not routed).
   - Depends on: step 3
   - Tests: create `server/test/reviews-smart-diff.it.test.ts` (above). Existing: `server/test/reviews.it.test.ts` and `server/test/routes-smoke.test.ts` must stay green.
   - Done when: `cd server && npm_config_verify_deps_before_run=false pnpm exec vitest run test/reviews-smart-diff.it.test.ts` passes, with Docker running (it self-skips without Docker; then report it as unverified); `pnpm typecheck` in `server/` passes.

5. Promote `FindingCard` to a shared component so the diff viewer can render it.
   - Module: client
   - Files:
     - create `client/src/components/finding-card/FindingCard.tsx`, `client/src/components/finding-card/index.ts`, `client/src/components/finding-card/constants.ts`, `client/src/components/finding-card/helpers.ts`, `client/src/components/finding-card/styles.ts`, `client/src/components/finding-card/FindingCard.test.tsx`
     - delete the six same-named files under `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/`
     - modify `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx`
   - Change:
     - Move the files with their content unchanged except imports: in `FindingCard.tsx`, replace `../../../../../../../lib/github-urls` with `@/lib/github-urls`; in the test, import messages from `../../../messages/en/prReview.json`.
     - The folder shape follows the `client/src/components/skill-body-editor/` precedent (kebab-case folder, flat component files, single-export `index.ts`).
     - In `FindingsPanel.tsx`, change `import { FindingCard } from "../FindingCard"` to `import { FindingCard } from "@/components/finding-card"`. Nothing else there changes.
     - Before deleting, confirm that `grep -rn "FindingCard" client/src` shows no other importer (none found when planning).
   - Skills: react-best-practices, frontend-ui-architecture, typescript-expert. Rule: frontend-ui-architecture "Promote to top-level `src/components/` only once a component is used by 2+ routes/features" (now the Agent runs tab and `diff-viewer`); a shared component must not import from a route's `_components/`; use the `@/*` alias instead of `../` chains.
     - `FindingsPanel.tsx`: add next-best-practices.
     - `FindingCard.test.tsx`: react-testing-library.
   - Depends on: none
   - Tests: the moved `client/src/components/finding-card/FindingCard.test.tsx` and the existing `FindingsPanel/FindingsPanel.test.tsx`, both unchanged in assertions.
   - Done when: `cd client && npm_config_verify_deps_before_run=false pnpm exec vitest run src/components/finding-card src/app/repos` passes, and `pnpm typecheck` in `client/` passes.

6. Teach the shared diff viewer to show findings: a file-header dot, a line stripe with a severity label, FindingCards under the line, and an outside-the-diff block. Also add every new Smart Diff i18n key.
   - Module: client
   - Files:
     - modify `client/messages/en/prReview.json`
     - create `client/src/components/diff-viewer/findings.ts`
     - create `client/src/components/diff-viewer/FindingsOutsideDiff/FindingsOutsideDiff.tsx` and `client/src/components/diff-viewer/FindingsOutsideDiff/index.ts`
     - modify `client/src/components/diff-viewer/constants.ts`, `client/src/components/diff-viewer/styles.ts`, `client/src/components/diff-viewer/FileCard/FileCard.tsx`, `client/src/components/diff-viewer/CodeLine/CodeLine.tsx`, `client/src/components/diff-viewer/DiffViewer/DiffViewer.tsx`, `client/src/components/diff-viewer/index.ts`
     - create `client/src/components/diff-viewer/FileCard/FileCard.test.tsx`
   - Change:
     - `prReview.json`, under the existing `smartDiff` object: keep every existing key and add the following (they serve this step and step 7):
       - `"testsLabel": "Tests"`
       - `"docsLabel": "Docs"`
       - `"smartOrder": "Smart order"`
       - `"originalOrder": "Original order"`
       - `"reviewNotRun": "Review not run yet"`
       - `"filesWithFindings": "{count} files with findings"`
       - `"fileHasFindings": "Has review findings"`
       - `"outsideDiffTitle": "{count} finding(s) outside the diff"`
       - `"lineLabel": { "CRITICAL": "blocker", "WARNING": "warning", "SUGGESTION": "suggestion" }`
     - `findings.ts` mirrors `comments.ts`, with type-only imports from `@devdigest/shared`. It exports:
       - `interface DiffFindingApi { findings: FindingRecord[]; showFindings: boolean; pending: boolean; onAction: (findingId: string, action: FindingActionKind) => void }`. The doc comment says that `findings` spans all files, and that `showFindings` hides only the cards (stripe, label and dot stay).
       - `isOpenFinding(f: FindingRecord): boolean` (`dismissed_at == null`).
       - `partitionFindings(findings: FindingRecord[], renderedKeys: Set<string>): { matched: Map<string, FindingRecord[]>; outsideDiff: FindingRecord[] }`, keyed by `lineKey("RIGHT", f.start_line)` from `comments.ts`; any finding whose key is not rendered goes to `outsideDiff`.
       - `findingsForLine(ln: Line, matched: Map<string, FindingRecord[]>): FindingRecord[]` (RIGHT key of `add`/`ctx` lines only).
       - `topSeverity(findings: FindingRecord[]): FindingRecord["severity"] | null`: the most severe open finding, by `SEVERITY_RANK`.
     - `constants.ts`: add `SEVERITY_RANK: Record<FindingRecord["severity"], number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 }` and `LINE_LABEL_KEY: Record<FindingRecord["severity"], string> = { CRITICAL: "smartDiff.lineLabel.CRITICAL", WARNING: "smartDiff.lineLabel.WARNING", SUGGESTION: "smartDiff.lineLabel.SUGGESTION" }`.
     - `styles.ts`: add the following, all colours from `SEV` (`@devdigest/ui`), never a new palette:
       - `findingStripeFor(sev): CSSProperties` → `{ boxShadow: \`inset 3px 0 0 ${SEV[sev].c}\` }` (an inset shadow avoids shifting the gutter);
       - `lineLabelFor(sev): CSSProperties` (fontSize 11, fontWeight 600, `color: SEV[sev].c`, `flexShrink: 0`, `paddingRight: 12`);
       - `s.findingDot` (8×8 circle, `background: SEV.CRITICAL.c`).
     - `DiffViewer.tsx`: new optional prop `findingApi?: DiffFindingApi`, passed to every `FileCard`.
     - `FileCard.tsx`: new optional prop `findingApi?: DiffFindingApi`.
       - In the existing `useMemo` style, compute `fileFindings = findingApi.findings.filter((f) => f.file === file.path)` and `partitionFindings(fileFindings, renderedKeys)`, reusing the `renderedKeys` loop that already exists for comments.
       - In the header, right after the existing comment counter, render `<span role="img" aria-label={t("smartDiff.fileHasFindings")} style={s.findingDot} />` when `fileFindings.some(isOpenFinding)`. It has no number, so it stays distinct from the `MessageSquare` GitHub-comment counter. Use `useTranslations("prReview")` as a second translator; the existing `"shell"` one stays.
       - Pass `findings={findingsForLine(ln, matched)}` and `findingApi` to each `CodeLine`.
       - After `OutdatedComments`, render `{findingApi?.showFindings && <FindingsOutsideDiff findings={outsideDiff} findingApi={findingApi} />}`. It also renders when the patch is null (the "no diff text" branch).
     - `CodeLine.tsx`: new props `findings: FindingRecord[]` and `findingApi?: DiffFindingApi`.
       - Compute `const sev = topSeverity(findings)`. When it is non-null, merge `findingStripeFor(sev)` into the row style and append `<span style={lineLabelFor(sev)}>{t(LINE_LABEL_KEY[sev])}</span>` after the line text: CRITICAL → "blocker", WARNING → "warning", SUGGESTION → "suggestion".
       - When `findingApi?.showFindings`, render before the GitHub threads, for each finding: `<div key={f.id} style={cs.thread}><FindingCard f={f} defaultExpanded pending={findingApi.pending} onAction={(a) => findingApi.onAction(f.id, a)} /></div>`, importing `FindingCard` from `@/components/finding-card`.
       - Call `useTranslations("prReview")` at the top, before the `hunk` early return, to keep hook order.
     - `FindingsOutsideDiff.tsx` mirrors `OutdatedComments.tsx`: it returns `null` for an empty list; otherwise it renders `cs.outdatedWrap`, a title `t("smartDiff.outsideDiffTitle", { count })` in `cs.outdatedTitle`, then one `FindingCard` per finding (`defaultExpanded`, same `onAction`/`pending` wiring).
     - `index.ts`: add `export type { DiffFindingApi } from "./findings";`.
     - All new props are optional, so `client/src/test/smoke.test.tsx` (which renders `DiffViewer` with only `shell` messages) keeps passing unchanged. No `prReview` string renders without findings.
   - Skills: react-best-practices, frontend-ui-architecture, typescript-expert.
     - react-best-practices: "Derive, don't store" (dot, stripe and partition are computed during render, with `useMemo` only where `FileCard` already memoises the comment partition); max 5–7 props (`CodeLine` ends at 6); "NEVER use `{count && …}`" (use explicit booleans).
     - frontend-ui-architecture: component folder shape for `FindingsOutsideDiff/`; pure logic in a colocated `.ts` like the existing `comments.ts`.
     - `prReview.json`: none routed.
     - `FileCard.test.tsx`: react-testing-library.
   - Depends on: step 5
   - Tests: create `client/src/components/diff-viewer/FileCard/FileCard.test.tsx`. It wraps `FileCard` in `NextIntlClientProvider` with `{ shell, prReview }` messages (relative imports `../../../../messages/en/shell.json` and `../../../../messages/en/prReview.json`) and uses `userEvent`. It contains two flow tests:
     1. A file with a patch containing new line 45, plus findings at `start_line` 45 (WARNING) and 999 (CRITICAL). Assertions:
        - the dot is present (`getByRole("img", { name: "Has review findings" })`);
        - the WARNING title renders and the label "warning" is shown;
        - "1 finding(s) outside the diff" and the CRITICAL title are present;
        - clicking "Accept" calls `onAction` with `(id, "accept")`.
     2. Same data with `showFindings: false`: the finding titles are gone, but the "warning" label and the dot stay. A file with no findings shows no dot.
   - Done when: `cd client && npm_config_verify_deps_before_run=false pnpm exec vitest run src/components/diff-viewer src/test/smoke.test.tsx` passes, and `pnpm typecheck` in `client/` passes.

7. Group the Files changed tab by role (Smart order / Original order toggle), and feed it the review findings and group counters.
   - Module: client
   - Files:
     - modify `client/src/lib/hooks/reviews.ts` · modify `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx`
     - create `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/helpers.ts`, `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/styles.ts`
     - create `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/_components/SmartDiffGroup/SmartDiffGroup.tsx`, `.../SmartDiffGroup/index.ts`, `.../SmartDiffGroup/constants.ts`, `.../SmartDiffGroup/styles.ts`
     - create `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.test.tsx`, `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/helpers.test.ts`
   - Change:
     - `reviews.ts`: add `useSmartDiff(prId: string | null | undefined)` = `useQuery({ queryKey: ["smart-diff", prId], queryFn: () => api.get<SmartDiffResponse>(\`/pulls/${prId}/smart-diff\`), enabled: !!prId })`, with `SmartDiffResponse` as a type-only import. There is no polling.
     - `DiffTab/helpers.ts`, type-only imports:
       - `pickLatestReviewPerAgent(reviewsNewestFirst: ReviewRecord[]): ReviewRecord[]` — the same rule as the server function of the same name (step 3): `kind === "review"`, first per `agent_id`, with `null` as one agent. Its doc comment points to `server/src/modules/reviews/smart-diff/build.ts` as the twin to keep in sync.
       - `groupFilesByRole(smartDiff: SmartDiff, files: PrFile[]): { role: SmartDiffRole; files: PrFile[] }[]`. Groups come in the server's order. Each group's paths are mapped to the `PrFile`s of `files`, keeping `files` (GitHub) order within the group. Any `PrFile` absent from every group is appended to the `core` group, so nothing disappears.
       - `countFilesWithFindings(files: PrFile[], findings: FindingRecord[]): number`: the number of files with at least one open finding (`dismissed_at == null`) on that path. This counts files, not findings: 2 files with 5 findings → 2.
     - `SmartDiffGroup/constants.ts`:
       - `ROLE_LABEL_KEY: Record<SmartDiffRole, string>`, mapping `core` → `"smartDiff.coreLabel"` and likewise for tests, wiring, docs and boilerplate;
       - `COLLAPSED_BY_DEFAULT: ReadonlySet<SmartDiffRole> = new Set(["docs", "boilerplate"])`.
     - `SmartDiffGroup.tsx`: props `{ role, files, filesWithFindings, commenting, findingApi }`.
       - `open` state starts as `files.length > 0 && !COLLAPSED_BY_DEFAULT.has(role)`. Inside an open group each `FileCard` keeps its own existing `AUTO_EXPAND_MAX_LINES` rule.
       - The header is a `role="button"` element with `aria-expanded`, Enter/Space toggling and a chevron, the same as the `FileCard` header. It shows the role label, then — only when `filesWithFindings > 0` — `<span aria-label={t("smartDiff.filesWithFindings", { count })}>` holding a red dot (`SEV.CRITICAL.c`) and the number, then `t("smartDiff.filesCount", { count: files.length })`.
       - The body, when open, is `<DiffViewer files={files} commenting={commenting} findingApi={findingApi} />`.
     - `DiffTab.tsx`:
       - Add `usePrReviews(prId)`, `useSmartDiff(prId)` and `useFindingAction()` next to the existing comment hooks.
       - Add `const [order, setOrder] = React.useState<"smart" | "original">("smart")`.
       - Change the `showComments` initial value from `false` to `true`, and update the comment above it: finding comments share this toggle and must be visible when a file is expanded.
       - Derive `latest = pickLatestReviewPerAgent(reviews ?? [])` and `findings = latest.flatMap((r) => r.findings)`.
       - Build `findingApi: DiffFindingApi = { findings, showFindings: showComments, pending: action.isPending, onAction: (findingId, act) => action.mutate({ findingId, action: act, prId: prId ?? undefined }) }`.
       - In the `SectionLabel` `right` slot:
         - two `Chip`s (`@devdigest/ui`) labelled `smartDiff.smartOrder` / `smartDiff.originalOrder`, with `active` on the current order;
         - the existing show/hide button, now shown when `commentCount + findings.length > 0`, with the count in its label being `commentCount + findings.length`;
         - when `reviews` has loaded and `latest.length === 0`, a muted `smartDiff.reviewNotRun` text. That empty state replaces the counters before the first review.
       - Body: when `order === "smart"` and `smartDiff` is loaded, render one `SmartDiffGroup` per entry of `groupFilesByRole(smartDiff, files)`, with `filesWithFindings = countFilesWithFindings(group.files, findings)`. Otherwise — Original order, or smart-diff still loading or failed — render `<DiffViewer files={files} commenting={commenting} findingApi={findingApi} />`, so the tab never blocks on the new endpoint. Query errors already surface as toasts through `client/src/lib/providers.tsx`.
       - Layout styles go in `DiffTab/styles.ts`.
       - Refresh after Run review comes from the existing cache: `useFindingAction` and `useRunReview` invalidate `["reviews", prId]`, and `page.tsx`'s `onRunDone` refetches reviews, so the counters, dots and cards update without a reload. No new polling.
   - Skills: react-best-practices, frontend-ui-architecture, typescript-expert, next-best-practices.
     - react-best-practices: "Business logic in hooks/helpers, NOT in component bodies" (grouping, counting and the latest-review rule live in `helpers.ts`); "Derive, Don't Store" (no `useEffect`; `findings` and the counters are computed from the queries); key by `role` and `file.path`, never by index, for the new lists.
     - frontend-ui-architecture: the sub-component lives in `DiffTab/_components/SmartDiffGroup/` with the folder shape; data fetching only in `src/lib/hooks/reviews.ts`; constants colocated in the folder that uses them.
     - next-best-practices: the files stay `"use client"` leaves under the route.
     - `client/src/lib/hooks/reviews.ts`: react-best-practices, frontend-ui-architecture, typescript-expert (no next-best-practices; not under `app/`).
     - `DiffTab.test.tsx` and `helpers.test.ts`: react-testing-library.
   - Depends on: steps 1, 4, 6
   - Tests:
     - `helpers.test.ts` has three cases:
       1. `pickLatestReviewPerAgent`, with the same cases as the server test in step 3;
       2. `groupFilesByRole` keeps GitHub order within a group and appends an unmatched file to core;
       3. `countFilesWithFindings`: 2 files with 5 findings → 2, and a dismissed-only file is not counted.
     - `DiffTab.test.tsx` uses `vi.mock("@/lib/hooks/reviews", …)` (the repo precedent is `FindingsPanel.test.tsx`; the agents README says to mock at the `@/lib` boundary, not MSW) and returns fixtures for `usePrComments`, `useCreatePrComment`, `usePrReviews`, `useSmartDiff` and `useFindingAction`. It wraps the component in `NextIntlClientProvider` with `{ shell, prReview }` and uses `userEvent`. Three flow tests:
       1. Smart order:
          - the group headers read Core, Tests, Wiring, Docs, Boilerplate in that order, each with its "N files";
          - `pnpm-lock.yaml` is not visible until the Boilerplate header is clicked, and a `README.md` path is likewise hidden until Docs is clicked;
          - the Core header has `getByLabelText("1 files with findings")`;
          - a finding from an older review by the same agent is not rendered;
          - clicking "Accept" calls the mocked `mutate` with `{ findingId, action: "accept", prId }`.
       2. Clicking "Original order" renders the file paths in the fixture's GitHub order, with no group headers.
       3. With `usePrReviews` → `[]`: "Review not run yet" is shown, no "files with findings" label exists, and the five group headers still render (grouping before the first review).
   - Done when: `cd client && npm_config_verify_deps_before_run=false pnpm exec vitest run` passes (the whole client suite, including `smoke.test.tsx`, `FindingsPanel.test.tsx` and the new tests); `pnpm typecheck` in `client/` passes; with `./scripts/dev.sh` running, PR #482 → Files changed shows the five groups, the Core header shows "● 2" before "4 files", and each of `src/config.ts` and `src/api/users.ts` shows a dot plus its finding in the "outside the diff" block (the seeded files have no patch).

8. Record the feature specs, following the specs convention of one file per feature.
   - Module: server + client
   - Files: create `server/specs/smart-diff.md` · create `client/specs/smart-diff.md`
   - Change:
     - Server spec: the endpoint `GET /pulls/:id/smart-diff` and its response (`SmartDiffResponse`, five groups always present in display order); the classification rules and check order (pointing to `server/src/modules/reviews/smart-diff/constants.ts` as the source of truth and to the three disputed rows pinned in `server/test/reviews-smart-diff.test.ts`); the "latest review per agent" rule; that `finding_lines` uses `start_line` of non-dismissed findings; the minimal `split_suggestion`; and that there is no LLM call.
     - Client spec: the P1/P2/P3 acceptance as implemented — group order, collapsed roles, counter semantics (files, not findings), the dot versus the GitHub-comment counter, inline cards, stripe and label mapping, the outside-the-diff block, the shared comments toggle (default shown), the Smart/Original toggle, the empty state, and the not-done sticky header with its reason.
     - Each spec stays under about 60 lines and links the plan's open questions where it records an assumed decision.
   - Skills: none routed — a docs-only step. Keep wording consistent with the names used in code (`classifyFile`, `pickLatestReviewPerAgent`, `DiffFindingApi`).
   - Depends on: steps 4 and 7
   - Tests: none (documentation)
   - Done when: both files exist, and every rule and behaviour they state can be traced to a test named in steps 2–7.

## Contracts and data
- Zod (both vendored copies, byte-identical): `SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate'])`. `SmartDiffFile`, `SmartDiffGroup`, `SmartDiff` and `SmartDiffResponse` are unchanged in shape: `groups[{ role, files[{ path, additions, deletions, finding_lines: int[], pseudocode_summary? }] }]` plus `split_suggestion { too_big, total_lines, proposed_splits[] }`.
- Endpoint: `GET /pulls/:id/smart-diff` (reviews module).
  - Params: `IdParams` (uuid; otherwise 422).
  - Workspace-scoped via `getContext` + `ReviewRepository.getPull` (404 `Pull request not found`).
  - Response 200: `SmartDiffResponse`, validated by the route's `response` schema.
  - Always five groups in display order; `finding_lines` = sorted unique `start_line` of non-dismissed findings from the latest `kind: 'review'` review of each agent; `split_suggestion = { too_big: false, total_lines: Σ(additions + deletions), proposed_splits: [] }`.
  - No model call. The default global rate limit applies, as for the other GETs.
- DB schema / migration: none.
- i18n: `client/messages/en/prReview.json` → `smartDiff` gains `testsLabel`, `docsLabel`, `smartOrder`, `originalOrder`, `reviewNotRun`, `filesWithFindings`, `fileHasFindings`, `outsideDiffTitle`, `lineLabel.{CRITICAL,WARNING,SUGGESTION}`.

## Verification
- Modules to typecheck and test, each command run from the module root with `npm_config_verify_deps_before_run=false`:
  - `server`: `pnpm typecheck`; the unit lane `pnpm exec vitest run --exclude '**/*.it.test.ts'`; the integration lane `pnpm exec vitest run .it.test` (needs Docker; make sure `server/.env` has no empty `LOG_LEVEL=` line, see `server/insights.md` 2026-09-15).
  - `client`: `pnpm typecheck`; `pnpm test`.
- Extra checks:
  - Client production build `pnpm build` in `client/`. Reason: `client/insights.md` 2026-09-25 — a runtime import from `@devdigest/shared` passes tsc and vitest but breaks the build. Every new client import from it must be `import type`.
  - Vendored drift: `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` prints nothing.
  - Hermetic e2e `cd e2e && npm run e2e:hermetic`. Reason: `05-pr-diff` waits for `src/config.ts` on the Files changed tab, which now renders through `SmartDiffGroup`; Core is expanded by default, so the flow should still pass unchanged. Needs Docker and the `agent-browser` CLI; report it as unverified if they are unavailable.
  - No `pnpm db:generate`: there is no schema change.
- PR description draft (for whoever opens the PR):
  - What: Smart Diff on the Files changed tab — files grouped core → tests → wiring → docs → boilerplate by a pure path classifier (`server/src/modules/reviews/smart-diff/`), served by `GET /pulls/:id/smart-diff` (a Zod-validated `SmartDiff`, with no model call); the latest review findings shown in the diff as group counters (files with findings), a file dot, inline FindingCards with Accept/Dismiss, a line stripe with a blocker/warning/suggestion label, and an outside-the-diff block; a Smart/Original order toggle. `SmartDiffRole` is extended to five roles in both vendored `brief.ts` copies. `FindingCard` is promoted to `client/src/components/finding-card/`.
  - Decisions: the "latest review" means the newest review per agent; dismissed findings are not counted but are still shown muted; the comments toggle now defaults to shown; the sticky header was skipped (with reason).
  - Process: subagents used — `planner` (this plan), `implementer`, `plan-verifier`, `architecture-reviewer`, plus `test-writer` / `researcher` only if invoked. `plan-verifier` checks every requirement clause and every step's files, change, tests and `Done when` in this plan, and marks each pass, fail or unverified with evidence it read or ran (fill in its actual result table summary before opening the PR).
  - Demo video: link to be added by the author.

## Open questions
- Which findings make up "the latest review's findings"? — assumed: the newest `kind: 'review'` review per `agent_id` (null counts as one agent), implemented identically as `pickLatestReviewPerAgent` on the server (step 3) and the client (step 7). Rejected alternatives:
  - the newest single review: "Run all" would drop the other agents' findings;
  - all reviews, as the header's `findingsCount` does: re-runs would duplicate cards on the same line;
  - the PR list's latest batch (`pickLatestBatchByPr`): the client cannot reproduce it, because `ReviewRecord` has no `multi_agent_run_id`, and adding it is a contract change.

  The two copies of the rule can drift; their tests share the same cases. — affects: steps 3, 4, 7.
- Do dismissed findings count? — assumed: excluded from `finding_lines`, the file dot, the group counter and the line stripe (matching the PR list's "dismissed excluded"), but their cards still render muted (FindingCard's existing style), so Dismiss is visible and reversible. — affects: steps 3, 6, 7.
- Comments toggle default — assumed: it changes from hidden to shown. P1 requires the finding comment to appear when a file is expanded, and P2 requires findings to share the GitHub-comments toggle. One side effect: GitHub comments are now shown by default too. — affects: step 7.
- Empty groups — assumed: all five groups always render, empty ones as "0 files" and collapsed, to match the literal P1 "five groups in order". The alternative is to hide empty groups (a one-line filter in `DiffTab.tsx`). — affects: step 7.
- Smart/Original toggle state — assumed: local `useState` in `DiffTab`, reset on reload. react-best-practices says "URL-dependent state (filters, pagination, search) belongs in URL search params". This is a view preference rather than a shareable filter. If it should survive reload or links, use `?order=original` through `page.tsx`'s existing `setParam`. — affects: step 7.
- `dist/**` and `build/**` are root-anchored, as written in the requirement — assumed literal: `server/dist/x.js` is not boilerplate by that rule (a nested `index.js` there would hit the wiring barrel rule). — affects: step 2.
- Classifier placement — assumed: `server/src/modules/reviews/smart-diff/`, next to `run-executor.ts`, its future caller. If the pre-prompt filter lesson puts prompt assembly in `reviewer-core` (per `server/CLAUDE.md`), the two pure files can move there unchanged, since they import nothing outside `@devdigest/shared`. — affects: step 2.
- Promoting `FindingCard` changes one import line in the Agent runs tab's `FindingsPanel.tsx` — assumed acceptable under "no changes to the Agent runs tab", because the behaviour is unchanged. — affects: step 5.
- Live refresh edge — assumed out of scope: if the user switches to Files changed while a run is in flight, `FindingsTab` (which owns `RunStatus.onDone`) is unmounted, so reviews refresh only on the next refetch (after the 30 s `staleTime`, on remount). The normal flow — Run review switches to Agent runs, then back — refreshes without a reload. — affects: step 7.

## For reviewers
- Architecture:
  - the route stays thin (`getContext` → `service.smartDiff` → return) and adds a `response` schema;
  - `classify.ts`, `build.ts` and `constants.ts` are pure and import nothing from Fastify, the DB or `container`;
  - the service uses only existing `ReviewRepository` methods;
  - `diff-viewer` (shared) imports `FindingCard` only from `@/components/finding-card`, never from a route `_components/`;
  - client imports from `@devdigest/shared` are type-only;
  - `pickLatestReviewPerAgent` exists twice by design (server and client); confirm both test files pin the same cases.
- Contract: both `brief.ts` copies are byte-identical, and no other contract changed.
- Security:
  - the new GET is workspace-scoped through `getPull(workspaceId, prId)` before `getPrFiles` / `reviewsForPull`, which themselves take only `prId`; the integration test pins the 404 for an unknown id;
  - there is no new input besides the uuid param;
  - there is no outbound request (no GitHub, no LLM; `llmMock.calls` stays empty);
  - finding text renders through the existing `FindingCard` → `Markdown` path, with no new HTML sink.
