# Development Plan: Blast Radius (what else a pull request's changes can reach)

## Requirement
`server/specs/blast-radius.md` — the course homework "Blast Radius", transcribed together with this fork's starter state and the owner-accepted Decisions (every entry under "Decisions" is treated as decided).

Owner decisions made after this plan was drafted: (1) the MCP tool keeps `openWorldHint: false`, as the spec says; (2) steps 9 and 10 (the P3 `resync-button` and `collapsible-tree`) are built together with steps 1–8.

Goal: show the map that `repo-intel` already computed when it indexed the repository — the symbols declared in the PR's changed files, who calls them (`file:line`), and the HTTP endpoints and crons that depend on them. It appears in two places: a Blast radius block on the PR page's Overview tab, and the MCP tool `devdigest_get_blast_radius`, which replaces the lab's stub. One new route, `GET /pulls/:id/blast` (module `server/src/modules/blast/`), maps the facade's `BlastResult` to the shared `BlastRadius` contract with no model call, no GitHub call and no re-parse. The block and the MCP tool both show that same response.

Which step covers which acceptance criterion (labels from the spec's tables):
- P1:
  - `block`: steps 5, 6
  - `summary`: steps 2, 5
  - `callers-and-endpoints`: steps 2, 5
  - `github-link`: steps 5, 6
  - `empty-and-partial`: steps 2, 3, 5
  - `mcp-tool`: steps 7, 8
  - `test-pr`: steps 2–6, plus the owner's test PR (see Open questions)
  - `pr-and-video`: owner work (see Out of scope)
- P2:
  - `no-reparse`: step 3
  - `contract-validated`: steps 1, 3
  - `mapping-test`: step 2
  - `no-llm`: step 3
  - `decl-file-excluded`: step 2
  - `limits-from-constants`: steps 2 and 5 add no limit literal (also under Extra checks)
  - `degraded-reaches-ui`: steps 1, 2, 3, 5
  - `mcp-lab-rules`: step 7
  - `subagents-named`: the PR description draft under Verification
- P3. Three come free with the P1 design, two are final steps the owner chose to build, two are out of scope:
  - free: `rank-order` (step 2 keeps the facade's rank order), `crons-separate` (step 5 gives crons their own list with a clock icon), `labels-from-json` (steps 4, 5)
  - owner-chosen final steps: `resync-button` (step 9), `collapsible-tree` (step 10)
  - out of scope: `graph-toggle`, `prior-prs`

## Out of scope
- Any edit to `server/src/modules/repo-intel/`: the facade, the index, `constants.ts` and their tests. The owner decided this. The blast mapper makes up for two gaps instead: it upgrades a `partial` index to `index_partial`, and it drops callers that sit in the declaring file.
- `graph-toggle` (P3). It needs a three-column graph with connecting lines and a legend, drawn by hand because no new dependency is allowed, with a layout for any number of callers and endpoints. That is not cheap. The keys `view.tree` and `view.graph` stay unused.
- `prior-prs` (P3). It needs a GitHub call and an endpoint of its own, because `PrHistory` has no data source in this fork, and the map must never depend on GitHub.
- An LLM text summary (Decision "No LLM text summary").
- The rest of the design's page: PR brief, verdict, score, risk areas, and the two-column grid.
- A new e2e flow (spec: "No end-to-end browser flow unless the owner asks").
- MCP tests. The module has none (`TESTING.md`: "typecheck only; tests deferred (round 2)").
- New spec files. The requirement spec `server/specs/blast-radius.md` already covers all three modules.
- `plans/mcp-server.md`. It keeps its historical description of the stub.
- Owner work, from the spec's "Needs the owner":
  - choosing or opening the test PR;
  - recording the demo video and opening the PR (`pr-and-video`);
  - writing a `partial` index row into the dev database for the badge demo.
- The workflow after implementation: architecture-reviewer, plan-verifier, `/pr-self-review`, `engineering-insights`.

## Context
- Insights applied: `server/insights.md` — 2026-10-21 — "`MAX_CALLERS_PER_SYMBOL` (20) cuts the whole callers list once … an index with status `partial` is answered with `degraded: false`; the only `reason` blast ever returns is `no_data` … read `getIndexState` for a partial badge". Effect here:
  - step 3 reads `getIndexState`;
  - step 2 upgrades `partial` to `degraded: true, reason: 'index_partial'`;
  - the PR description draft states the whole-list cap (Decision "The cap of 20 callers stays").
  - I checked the code (`service.ts:338,386,389`) and it agrees with the entry.
- Insights applied: `server/insights.md` — 2026-09-17 — "grep that module's own `*.test.ts` files too — a tested-but-unused pure function is easy to miss". Checked: no blast mapper exists anywhere in `server/test/` or `server/src/`. The only test-file mentions of blast are `repo-intel-facade-degraded.test.ts` (the facade's degraded shape), `extract.test.ts` / `astgrep.test.ts` (extraction) and `contracts.test.ts`. So step 2 creates the mapper.
- Insights applied: `server/insights.md` — 2026-09-15 — an empty `LOG_LEVEL=` in `server/.env` breaks every `*.it.test.ts`. Effect here: a warning under Verification.
- Insights applied: `client/insights.md` — 2026-09-25 — "Importing a runtime value (not `import type`) from `@devdigest/shared` passes `tsc` and vitest but fails `pnpm build` … mirror needed constants locally". Effect here:
  - every client file imports `BlastRadius`, `DownstreamImpact` and `BlastDegradedReason` as types only;
  - the reason list the client needs at runtime is a local `Record<BlastDegradedReason, string>` (step 5);
  - the client build is listed under Extra checks.
- Insights applied: `client/insights.md` — 2026-10-08 — "`useTranslations("ns")` fails when the hook is created … needs that namespace added to every existing test that renders it". Effect here: step 4 adds `blast` to `renderWithProviders` in `client/src/test/render.tsx`.
- Insights applied: root `insights.md` — 2026-09-24 — run pnpm scripts with `npm_config_verify_deps_before_run=false`. Effect here: every command in this plan sets it.
- Insights applied: root `insights.md` — 2026-10-21 — `mcp-server/` has no verification row in the agent files. Effect here: its typecheck is under Extra checks.
- Insights applied: root `insights.md` — 2026-09-21 — `dev-digest/` is a nested clone. Effect here: ignore any match under it.
- Insights applied: root `insights.md` — 2026-09-29 — the real Postgres container runs under the `default` Docker context. Effect here: a note in the manual run under Verification.
- Insights applied: `mcp-server/insights.md` — 2026-10-16 — with Zod 4 schemas, a bad argument comes back as an `isError` result "Input validation error …" before the handler runs. Effect here: step 7 adds no argument checks of its own.
- Constraints applied: "vendored copies … check both sides when you change a shared Zod contract" — root `CLAUDE.md`. Also project-rules rule 3, `contract-one-sided` — `.claude/skills/pr-self-review/project-rules.md`. Effect here: step 1 makes byte-identical edits to both `brief.ts` copies.
- Constraints applied: "Every route goes through `getContext()` for workspace scoping and Zod validation" — `server/CLAUDE.md`. Also project-rules rule 6, `workspace-scoping`, and the SECURITY comment in `server/src/modules/repo-intel/routes.ts:34-45` ("the `RepoIntel` facade itself is deliberately tenant-agnostic"). Effect here (step 3):
  - the route uses `getContext` and `IdParams`;
  - the service looks the PR up by workspace before it calls the facade;
  - the repo id comes from the PR row, never from the request.
- Constraints applied: "The actual LLM call lives in `reviewer-core`" — `server/CLAUDE.md`; "Review is never auto-triggered" — root `CLAUDE.md` and project-rules rule 1. Effect here: the route only reads, and the integration test pins that no model is called.
- Constraints applied: onion-architecture "Thin Routes", "Repository Owns Persistence" and "Composition Root Is the Only `new`". Also `server/src/platform/container.ts:70-72`, which says the shared repositories are "Constructed here … so consuming modules use `container.agentsRepo` instead of reaching into another module's folder". Effect here: `blast/` has no `repository.ts` and no Drizzle import. Its service calls `container.reviewRepo.getPull` / `getPrFiles` and `container.repoIntel`.
- Constraints applied: the header of `server/src/modules/repo-intel/types.ts` says features (it names blast) "import THIS, never the libraries". Effect here: step 2 imports `BlastResult`, `DegradedReason` and `IndexStatus` as types from `../repo-intel/types.js`.
- Constraints applied: `server/tsconfig.json` has `"include": ["src/**/*.ts"]`, so `pnpm typecheck` never compiles `server/test/`. Effect here: the type-level check that the reason lists match lives in `src/` (step 2). `contracts.test.ts` holds the runtime list check (step 1).
- Constraints applied: "Data fetching goes through the hooks in `src/lib/hooks/`" and "don't add a second polling mechanism" (that rule is about live review progress) — `client/CLAUDE.md`. Effect here: step 4 adds a hook with no polling; step 9 reuses the existing `useRepoIntelStatus` polling.
- Constraints applied: `mcp-server/CLAUDE.md`. Effect here (step 7):
  - Zod only as `zod/v4`;
  - `@devdigest/shared` imported as types only;
  - every tool returns through `toolResult` / `toolError`, and handlers never throw;
  - only `devdigest_run_agent_on_pull_request` may POST, so the blast tool sends GETs only.
- Constraints applied: the spec's "No new dependency", and "Nothing in the route, the mapper or a component repeats 20 or 2". Effect here: no `package.json` changes; steps 2 and 5 contain no limit literal.
- Constraints applied: frontend-ui-architecture "Default: colocate under the route that owns it". Effect here: the block lives in `client/src/app/repos/[repoId]/pulls/[number]/_components/BlastRadiusCard/`, next to its sibling `IntentCard`.
- Constraints applied: `security` is routed to almost every source file here. Following the planner rule, it is assigned only to:
  - step 3 (the new endpoint);
  - step 5's `DownstreamGroup.tsx` (repository content goes into text and into `href`);
  - step 7 (agent input, an outbound request, sanitised output).

## Steps

1. Add `degraded` and `reason` to the `BlastRadius` contract in both vendored copies.
   - Module: server + client (shared contract)
   - Files: modify `server/src/vendor/shared/contracts/brief.ts` · modify `client/src/vendor/shared/contracts/brief.ts` · modify `server/test/contracts.test.ts`
   - Change:
     - In both copies, directly above `BlastRadius`, add:
       - `export const BlastDegradedReason = z.enum(['flag_off', 'index_failed', 'index_partial', 'repo_too_large', 'no_data']);`
       - `export type BlastDegradedReason = z.infer<typeof BlastDegradedReason>;`
       - the one-line comment `// Why a blast radius may be incomplete — the values of repo-intel's DegradedReason (server/src/modules/repo-intel/types.ts).`
     - `BlastRadius` gains two fields after `summary`, under the comment `// Set by GET /pulls/:id/blast; absent in a stored PrBrief.`:
       - `degraded: z.boolean().optional()`
       - `reason: BlastDegradedReason.optional()`
     - Nothing else in either file changes, and the two files stay byte-identical. `PrBrief.blast` stays valid because both fields are optional.
     - `contracts.test.ts`: import `BlastDegradedReason` next to `BlastRadius`. In `it('Intent / BlastRadius / Risks / PrHistory')`:
       - keep the existing parse unchanged (an object without the new fields still parses);
       - add a parse of the same object plus `degraded: true, reason: 'index_partial'`, expected not to throw;
       - add `reason: 'stale'`, expected to throw;
       - add `expect([...BlastDegradedReason.options].sort()).toEqual(['flag_off', 'index_failed', 'index_partial', 'no_data', 'repo_too_large'])`.
   - Skills: zod
     - `schema-use-enums`: the reason is a fixed set of strings.
     - `object-optional-vs-nullable`: optional, because the key is absent from a stored `PrBrief.blast`; it is never null.
     - `type-use-z-infer`: the type comes from the schema.
     - Also project-rules rule 3 (both sides in one diff).
     - `contracts.test.ts`: none routed.
   - Depends on: none
   - Tests: `server/test/contracts.test.ts`, extended as above.
   - Done when:
     - `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` prints nothing;
     - `npm_config_verify_deps_before_run=false pnpm --dir server exec vitest run test/contracts.test.ts` passes;
     - `pnpm typecheck` passes in `server/` and in `client/`, with the same prefix.

2. Add the pure mapper `toBlastRadius` and the counter `countBlast`, with their test table written first.
   - Module: server
   - Files: create `server/test/blast-helpers.test.ts` (first) · create `server/src/modules/blast/helpers.ts`
   - Change:
     - Placement and naming:
       - The module folder is `blast/`, as the spec says.
       - Pure module-local functions go in `helpers.ts`, following `conventions/helpers.ts` and `repos/helpers.ts`. The test is named `<module>-helpers.test.ts`, following `conventions-helpers.test.ts`.
       - The file has only type imports: `BlastRadius`, `BlastDegradedReason` and `DownstreamImpact` from `@devdigest/shared`; `BlastResult`, `DegradedReason` and `IndexStatus` from `../repo-intel/types.js`.
       - It imports no Fastify, DB, `container` or constants.
     - `export interface BlastCounts { symbols: number; callers: number; endpoints: number; crons: number }`
     - `export function countBlast(blast: Pick<BlastRadius, 'changed_symbols' | 'downstream'>): BlastCounts`. Rules (Decision "Counting"):
       - `symbols` = `changed_symbols.length`;
       - `callers` = distinct (`file`, `name`) pairs across all groups;
       - `endpoints` = distinct strings across every group's `endpoints_affected`;
       - `crons` = distinct strings across every group's `crons_affected`.
     - `export function toBlastRadius(result: BlastResult, indexStatus: IndexStatus): BlastRadius`. The algorithm, in this order:
       1. `changed_symbols` = `result.changedSymbols.map(({ name, file, kind }) => ({ name, file, kind }))`, in facade order.
       2. Build a map from each changed symbol's name to the set of files that declare it.
       3. Walk `result.callers` in facade order (the facade sorts by `rank`, highest first). For each row, skip it when either:
          - its `file` is a declaring file of `viaSymbol` (`decl-file-excluded`); or
          - an earlier kept row has the same (`viaSymbol`, `file`, `symbol`). That is the facade's own dedupe key, and it is also the count key.
       4. Group the kept rows by `viaSymbol`, with groups in order of first appearance. A symbol none of whose rows is kept gets no group (Decision "`downstream` has a group only for a symbol that has callers").
       5. Each group is `{ symbol: viaSymbol, callers: rows.map((r) => ({ name: r.symbol, file: r.file, line: r.line })), endpoints_affected, crons_affected }`. The last two are the distinct values of `result.factsByFile?.[file]?.endpoints` / `.crons` over the group's caller files, in first-seen order. Both are `[]` when `factsByFile` is absent: the fallback path cannot attribute endpoints to a symbol.
       6. `summary` = `` `symbols: ${c.symbols}, callers: ${c.callers}, endpoints: ${c.endpoints}, crons: ${c.crons}` ``, with `c = countBlast(...)` over the result being built.
       7. Degraded state:
          - when `indexStatus === 'partial'` and `result.degraded !== true`, set `degraded: true, reason: 'index_partial'`;
          - otherwise set `degraded: result.degraded === true`, and set `reason: result.reason` only when degraded and the facade gave one.
          - The `reason` key is absent when not degraded. `degraded` is always present in the route's response.
     - Compile-time guard at the bottom of the file. A type `[DegradedReason] extends [BlastDegradedReason] ? ([BlastDegradedReason] extends [DegradedReason] ? true : false) : false`, plus one constant of that type assigned `true`. Comment above it: "`pnpm typecheck` fails here if repo-intel's `DegradedReason` and the contract's `BlastDegradedReason` stop being the same set". It lives in `src/` because `server/tsconfig.json` does not compile `test/`.
     - Test file (`describe('toBlastRadius')` plus `describe('countBlast')`). Every result is also run through `BlastRadius.parse` (a runtime import is fine on the server). Cases:
       1. Grouping and order: two symbols whose rows interleave. Groups come in first-appearance order, callers in facade order, and `name` comes from `symbol`.
       2. Duplicate rows: the same (`viaSymbol`, `file`, `symbol`) twice with different lines. The row is kept once, with the first line.
       3. Declaring-file drop:
          - `foo` is declared in `a.ts` and `bar` in `b.ts`;
          - a row in `a.ts` via `foo` is dropped, while a row in `a.ts` via `bar` is kept;
          - a symbol whose only caller sits in its declaring file has no group.
       4. Attribution through `factsByFile`: two groups whose callers sit in different files. Each group gets only its own files' endpoints and crons, de-duplicated in first-seen order. A caller file with no facts adds nothing.
       5. No `factsByFile`, but `impactedEndpoints` is non-empty: every `endpoints_affected` and `crons_affected` is `[]`.
       6. Counts and summary:
          - one (`file`, `name`) caller that reaches two symbols counts once;
          - an endpoint attributed in two groups counts once;
          - `summary` equals the exact string.
       7. Facade `degraded` passed through: `{ degraded: true, reason: 'no_data' }` with `indexStatus: 'degraded'` gives the same values.
       8. Partial upgrade, as an `it.each` table:
          - facade `degraded: false` with `'partial'` → `degraded: true, reason: 'index_partial'`;
          - facade `degraded: false` with `'full'` → `degraded: false` and `'reason' in result === false`;
          - facade `degraded: true, reason: 'no_data'` with `'partial'` → it stays `no_data`.
       9. Empty results:
          - the facade's empty answer → `changed_symbols: []`, `downstream: []`, summary `symbols: 0, callers: 0, endpoints: 0, crons: 0`;
          - changed symbols with no callers → `downstream: []`, and the summary counts the symbols.
   - Skills: onion-architecture, typescript-expert
     - onion-architecture: the mapping is pure inner logic with no Fastify, DB or container dependency, and it imports repo-intel's contract file as that file's header asks.
     - typescript-expert: explicit return types on the exported functions, no `any`, and the both-direction type check instead of a cast.
     - `server/test/blast-helpers.test.ts`: none routed.
   - Depends on: step 1
   - Tests: create `server/test/blast-helpers.test.ts` (above).
   - Done when: `npm_config_verify_deps_before_run=false pnpm --dir server exec vitest run test/blast-helpers.test.ts` passes every case, and `npm_config_verify_deps_before_run=false pnpm --dir server typecheck` passes.

3. Serve `GET /pulls/:id/blast` through a workspace-scoped `BlastService`, with a Zod-validated response and one log line per request.
   - Module: server
   - Files: create `server/src/modules/blast/service.ts` · create `server/src/modules/blast/routes.ts` · modify `server/src/modules/index.ts` · create `server/test/blast.it.test.ts`
   - Change:
     - `service.ts` exports `class BlastService { constructor(private readonly container: Container) }`. It has one method, `async blastRadius(workspaceId: string, prId: string, log: PinoLike): Promise<BlastRadius>`, with the doc comment "Reads only: no model, no GitHub, no index or resync job." In order:
       1. `const startedAt = Date.now()`.
       2. `const pull = await this.container.reviewRepo.getPull(workspaceId, prId)`. When it is missing, throw `new NotFoundError('Pull request not found')`. This lookup comes first because the facade is tenant-agnostic.
       3. `const changedFiles = (await this.container.reviewRepo.getPrFiles(prId)).map((f) => f.path)`.
       4. `const result = await this.container.repoIntel.getBlastRadius(pull.repoId, changedFiles)`. The repo id comes from the PR row.
       5. `const state = await this.container.repoIntel.getIndexState(pull.repoId)`.
       6. `const blast = toBlastRadius(result, state.status)` and `const counts = countBlast(blast)`.
       7. `log.info({ prId, indexStatus: state.status, changedFiles: changedFiles.length, ...counts, degraded: blast.degraded, reason: blast.reason ?? null, ms: Date.now() - startedAt }, 'blast radius read')`, then return `blast`.

       Imports: `type Container`, `type PinoLike` (`../../platform/run-logger.js`), `NotFoundError` (`../../platform/errors.js`), `type BlastRadius`, and `./helpers.js`. There is no `new`, no Drizzle, no `container.llm` and no `container.github()`.
     - `routes.ts` default-exports `async function blastRoutes(appBase: FastifyInstance)`, in the same shape as `reviews/routes.ts`. It contains:
       - `const app = appBase.withTypeProvider<ZodTypeProvider>()`, `const { container } = app`, `const service = new BlastService(container)`;
       - `app.get('/pulls/:id/blast', { schema: { params: IdParams, response: { 200: BlastRadius } } }, async (req) => { const { workspaceId } = await getContext(container, req); return service.blastRadius(workspaceId, req.params.id, req.log); })`;
       - `BlastRadius` imported as a value from `@devdigest/shared`;
       - a module header comment: `GET /pulls/:id/blast → BlastRadius read from the repo-intel index (no LLM, no GitHub, no re-parse)`, and the comment `// GET only reads the ready index: no model call, no index job.` above the route.
       - The default global rate limit applies, as for `/pulls/:id/smart-diff`. `serializerCompiler` (`server/src/app.ts:65`) validates the response against `BlastRadius` (`contract-validated`).
     - `modules/index.ts`: add `import blast from './blast/routes.js';` after the `conventions` import, and the entry `blast,` after `conventions,`. This is the "ADD A MODULE" recipe in that file's header.
     - `server/test/blast.it.test.ts` follows `reviews-smart-diff.it.test.ts`: `dockerAvailable()` gate, `startPg()`, `seed(db)`, PR #482 looked up by number, and `buildApp({ config, db, overrides: { git: new MockGitClient(), github: new MockGitHubClient(), llm: { openai: llmMock }, repoIntel } })`.
       - The test double: `repoIntel = { getBlastRadius: vi.fn(async () => FACADE_RESULT), getIndexState: vi.fn(async (repoId) => ({ repoId, status: 'partial', filesIndexed: 10, filesSkipped: 2, durationMs: 1, lastIndexedSha: 'abc', indexerVersion: 2, updatedAt: new Date() })) } as unknown as RepoIntel`, where `RepoIntel` is a type import.
       - `FACADE_RESULT`:
         - `changedSymbols: [{ file: 'src/middleware/ratelimit.ts', name: 'rateLimit', kind: 'function' }]`;
         - `callers`: `{ file: 'src/api/public/webhooks.ts', symbol: 'publicRouter', viaSymbol: 'rateLimit', line: 23, rank: 0.9 }` and `{ file: 'src/middleware/ratelimit.ts', symbol: 'helper', viaSymbol: 'rateLimit', line: 5, rank: 0.5 }`;
         - `impactedEndpoints: ['POST /webhooks']`;
         - `factsByFile: { 'src/api/public/webhooks.ts': { endpoints: ['POST /webhooks'], crons: [] } }`;
         - `degraded: false`.
       - Cases:
         1. 200, and `BlastRadius.parse(body)` succeeds. Then:
            - `getBlastRadius` was called once, with the seeded repo id and the four seeded `pr_files` paths (compare sorted);
            - `getIndexState` was called with that repo id;
            - the body equals the expected map: one group for `rateLimit`, the declaring-file caller dropped, `endpoints_affected: ['POST /webhooks']`, summary `symbols: 1, callers: 1, endpoints: 1, crons: 0`, `degraded: true`, `reason: 'index_partial'`;
            - `llmMock.calls` is empty;
            - the row count of `t.jobs` is the same before and after the request (no index or resync job).
         2. A PR in another workspace gives 404, and `getBlastRadius` was not called for it. Insert workspace B, a repo and a PR as `reviews-workspace-scoping.it.test.ts:49-82` does.
         3. A random uuid gives 404 with message `Pull request not found`; `/pulls/not-a-uuid/blast` gives 422.
   - Skills: onion-architecture, typescript-expert, fastify-best-practices, security
     - onion "Thin Routes": `getContext` → one service call → return.
     - onion "Repository Owns Persistence" and "Composition Root": the repositories and the facade come through `container`; `blast/` has no Drizzle.
     - onion "Avoid Anemic Services": scoping, both facade calls, the mapping and the log line live in the service.
     - fastify "Schema-first": `params` and `response` schemas on the route. Logging uses the request logger `req.log`.
     - security A01: the workspace-scoped `getPull` runs before the tenant-agnostic facade. The repo id never comes from the request. `IdParams` rejects a non-uuid id.
     - `service.ts`: onion-architecture, typescript-expert, security (fastify-best-practices is not routed to it).
     - `server/src/modules/index.ts`: onion-architecture, typescript-expert, fastify-best-practices.
     - `server/test/blast.it.test.ts`: fastify-best-practices (`app.inject`).
   - Depends on: step 2
   - Tests: create `server/test/blast.it.test.ts` (above). `server/test/routes-smoke.test.ts` and `server/test/reviews-smart-diff.it.test.ts` must stay green.
   - Done when:
     - `npm_config_verify_deps_before_run=false pnpm --dir server exec vitest run test/blast.it.test.ts` passes with Docker running. Without Docker it self-skips; then report it as unverified.
     - `npm_config_verify_deps_before_run=false pnpm --dir server typecheck` passes.

4. Add the client data hook, the missing `blast.json` keys, and the `blast` namespace in the test provider.
   - Module: client
   - Files: create `client/src/lib/hooks/blast.ts` · modify `client/src/lib/hooks/index.ts` · modify `client/messages/en/blast.json` · modify `client/src/test/render.tsx`
   - Change:
     - `client/src/lib/hooks/blast.ts`:
       - starts with `"use client";` and a header comment `/* hooks/blast.ts — the PR's blast radius (GET /pulls/:id/blast): read-only, no model call, no polling. */`;
       - exports `useBlastRadius(prId: string | null | undefined)` = `useQuery({ queryKey: ["blast-radius", prId], queryFn: () => api.get<BlastRadius>(\`/pulls/${prId}/blast\`), enabled: !!prId })`;
       - imports `api` from `"../api"` and `type BlastRadius` from `@devdigest/shared`.
       - The name follows `useSmartDiff` (named after its contract), and the file follows "one file per domain".
     - `hooks/index.ts`: add `export * from "./blast";` after `./repo-intel`.
     - `blast.json`: keep every existing key and add:
       - `"title": "Blast radius"`
       - `"loading": "Loading the blast radius…"`
       - `"loadError": "Could not load the blast radius."`
       - `"chips": { "endpoints": "HTTP endpoints", "crons": "Cron jobs" }`
       - `"badge"`, one label for each of the five reasons plus a fallback for a degraded answer without a reason:
         - `"flag_off": "Repository intelligence is off: callers come from a text search, endpoints are not attributed"`
         - `"index_failed": "The last index build failed: this map may be incomplete"`
         - `"index_partial": "The index is incomplete: some callers may be missing"`
         - `"repo_too_large": "The repository is too large to index fully: this map may be incomplete"`
         - `"no_data": "Not read from the repository index: any callers come from a text search, endpoints are not attributed"`
         - `"unknown": "This map may be incomplete"`

       The `no_data` text has to read right with data and without it, and also for a PR with no `pr_files` rows (spec "States" table).
     - `render.tsx`: add `import blast from "../../messages/en/blast.json";` and add `blast` to the `messages` object of `renderWithProviders`.
   - Skills: react-best-practices, frontend-ui-architecture, typescript-expert
     - react-best-practices: "ALL data fetching in custom hooks".
     - frontend-ui-architecture: "src/lib/hooks/*, one file per domain"; the small documented barrel gets one more line.
     - typescript-expert: a type-only import, per `client/insights.md` 2026-09-25.
     - `client/src/test/render.tsx`: react-testing-library.
     - `client/messages/en/blast.json`: none routed.
   - Depends on: step 1
   - Tests: no new test. The hook is exercised through the component test in step 5 (react-testing-library: "If a hook just fetches data … test it through the component").
   - Done when: `npm_config_verify_deps_before_run=false pnpm --dir client typecheck` passes, and `npm_config_verify_deps_before_run=false pnpm --dir client exec vitest run src/test` passes.

5. Build the Blast radius block: the summary row, one group per `downstream` entry, the badge, and the empty, loading and error states.
   - Module: client
   - Files: all under `client/src/app/repos/[repoId]/pulls/[number]/_components/BlastRadiusCard/`:
     - create `BlastRadiusCard.tsx`, `index.ts`, `constants.ts`, `helpers.ts`, `styles.ts`, `BlastRadiusCard.test.tsx`
     - create `_components/DownstreamGroup/DownstreamGroup.tsx`, `_components/DownstreamGroup/index.ts`, `_components/DownstreamGroup/styles.ts`
   - Change:
     - Placement:
       - The folder shape follows frontend-ui-architecture "Component Folder Shape". The single-export `index.ts` is `export { BlastRadiusCard, BlastRadiusCard as default } from "./BlastRadiusCard";`.
       - The sub-component sits in a nested `_components/` because only this card uses it.
       - The name `DownstreamGroup` is the spec's word for one `downstream` entry.
       - Every `.tsx` starts with `"use client";`, as `IntentCard` and `IntentSources` do.
     - `helpers.ts`:
       - `export interface BlastCounts { symbols: number; callers: number; endpoints: number; crons: number }`;
       - `export function countBlast(blast: Pick<BlastRadius, "changed_symbols" | "downstream">): BlastCounts`, with the same rules as the server function of the same name in step 2. Its doc comment says that it is the twin of `server/src/modules/blast/helpers.ts`, and that the UI never parses `summary` (Decision "Counting").
     - `constants.ts`, with type-only imports of `BlastDegradedReason` and `IconName`:
       - `SUMMARY_STATS: readonly { key: keyof BlastCounts; icon: IconName; labelKey: string }[]`, with these rows in order:
         - `symbols` / `Code` / `"stat.symbols"`
         - `callers` / `Users` / `"stat.callers"`
         - `endpoints` / `Globe` / `"stat.endpoints"`
         - `crons` / `Clock` / `"stat.crons"`
       - `DEGRADED_BADGE_KEY: Record<BlastDegradedReason, string>`, mapping each reason to `"badge.<reason>"`. This `Record` is the local runtime mirror of the reason list: it fails `tsc` if a reason is missing or extra.
     - `BlastRadiusCard.tsx`, props `{ prId: string | null; repoFullName: string | null; headSha: string }`. Early returns:
       - `!prId` → `null`.
       - `isLoading` → `<div role="status" aria-label={t("loading")}><Skeleton height={140} /></div>`.
       - `isError || !data` → `<div style={s.error}>{t("loadError")}</div>`, as `IntentCard` does.
       - Otherwise, a `<section style={s.card}>` containing:
         1. `<SectionLabel icon="Zap" right={badge}>{t("title")}</SectionLabel>`. `badge` is `null` unless `data.degraded`. When degraded it is `<Badge icon="AlertTriangle" color="var(--warn)" bg="var(--warn-bg)">{t(data.reason ? DEGRADED_BADGE_KEY[data.reason] : "badge.unknown")}</Badge>`.
         2. The summary row: `<ul style={s.stats}>` with one `<li key={stat.key} aria-label={\`${counts[stat.key]} ${t(stat.labelKey)}\`} style={s.stat}>` per `SUMMARY_STATS` entry. Each item holds the icon (`Icon[stat.icon]` from `@devdigest/ui`), the bold number, and the label.
         3. When `data.downstream.length === 0`: `<p style={s.empty}>{t("noDownstream", { count: counts.symbols })}</p>`. Otherwise one `<DownstreamGroup key={impact.symbol} impact={impact} repoFullName={repoFullName} headSha={headSha} />` per entry, in response order (rank order). When degraded, the badge shows above the map or above the empty text.
       - `counts = countBlast(data)` is computed during render: no state, no effect.
     - `DownstreamGroup.tsx`, props `{ impact: DownstreamImpact; repoFullName: string | null; headSha: string }`, renders an `<article>`:
       1. A header row: `<h3 className="mono">{impact.symbol}</h3>` and, at the right, `<span>{t("callerCount", { count: impact.callers.length })}</span>`.
       2. A callers `<ul>`. Each `<li key={\`${c.file}:${c.name}\`}>` holds the `CornerDownRight` icon and then the label `` `${c.file}:${c.line}` ``:
          - with `repoFullName`, it is `<MonoLink href={githubBlobUrl(repoFullName, headSha, c.file, c.line)}>`, which opens in a new tab with `rel="noopener noreferrer"`;
          - without it, it is a plain `<span className="mono">`.
       3. When `impact.endpoints_affected.length > 0`: `<ul aria-label={t("chips.endpoints")}>` with one `<li key={e}><Badge mono icon="Globe" color="var(--info)" bg="var(--info-bg)">{e}</Badge></li>` per endpoint.
       4. When `impact.crons_affected.length > 0`: a separate `<ul aria-label={t("chips.crons")}>` of `<Badge mono icon="Clock" color="var(--warn)" bg="var(--warn-bg)">` chips (amber; `crons-separate`).
       - Paths, symbol names and endpoint strings are repository content and are rendered as JSX text only. `githubBlobUrl` is imported from `@/lib/github-urls`.
     - `styles.ts` files: `satisfies CSSProperties` objects, as in `IntentCard/styles.ts`. `s.card` is the same box as `IntentCard`'s `card`. No limit literal and no `20` or `2` used as a cap or depth anywhere in this folder (`limits-from-constants`).
   - Skills: react-best-practices, frontend-ui-architecture, typescript-expert, next-best-practices
     - react-best-practices:
       - "Derive, Don't Store": counts are computed during render;
       - "For multiple UI states … use early returns";
       - keys are `symbol`, `file:name` and the endpoint string, never an index;
       - `length > 0` checks, never `{n && …}`;
       - at most 3 props per component.
     - frontend-ui-architecture:
       - "Component Folder Shape";
       - colocated `constants.ts` / `helpers.ts` / `styles.ts`;
       - the sub-component in `_components/`;
       - `@/` imports instead of `../` chains.
     - next-best-practices: `"use client"` leaves.
     - typescript-expert: type-only imports from `@devdigest/shared`; an exhaustive `Record` instead of a runtime import.
     - `DownstreamGroup.tsx` also gets security, A05 XSS. Repository strings are rendered as text, never as HTML. The `href` is always built by `githubBlobUrl` with the fixed `https://github.com` host and `encodeURIComponent`-ed path segments, so no `javascript:` URL can reach it.
     - `BlastRadiusCard.test.tsx`: react-testing-library.
   - Depends on: step 4
   - Tests: create `BlastRadiusCard.test.tsx`.
     - Setup:
       - `renderWithProviders` from `@/test/render`;
       - `vi.mock("@/lib/api", …)` with `api.get` as a `vi.fn`, exactly as `ConventionsView.test.tsx:11-15` does, plus `vi.clearAllMocks()` in `beforeEach`;
       - `userEvent` is not needed until steps 9 and 10.
     - Fixture `MAP` (`BlastRadius`):
       - three `changed_symbols`;
       - group `rateLimit` with callers `{ name: "handler", file: "src/routes/users.ts", line: 10 }` and `{ name: "syncJob", file: "src/jobs/sync.ts", line: 5 }`, `endpoints_affected: ["GET /users"]`, `crons_affected: ["sync-users"]`;
       - group `parseToken` with caller `{ name: "handler", file: "src/routes/users.ts", line: 14 }` and `endpoints_affected: ["GET /users"]`;
       - `summary` any string; `degraded: false`.
     - Flows:
       1. "shows the summary and each changed symbol's callers as GitHub links with endpoint and cron chips":
          - `getByRole("status", { name: "Loading the blast radius…" })` first;
          - then `findByRole("listitem", { name: "3 symbols" })`, and the list items `"2 callers"`, `"1 endpoints"`, `"1 cron/jobs"` (de-duplication across groups);
          - `getByRole("heading", { name: "rateLimit" })`;
          - `getByRole("link", { name: "src/routes/users.ts:10" })` has `href` `https://github.com/acme/widgets/blob/abc123/src/routes/users.ts#L10` and `target="_blank"`;
          - `within(getAllByRole("list", { name: "HTTP endpoints" })[0])` holds `GET /users`, and the "Cron jobs" list holds `sync-users`;
          - no badge text is present;
          - `api.get` was called with `/pulls/p1/blast`.
       2. `it.each` over the five reasons: `MAP` plus `degraded: true, reason` shows that reason's badge label from `blast.json` and still shows the link `src/routes/users.ts:10` (the map stays under the badge).
       3. "no callers": `downstream: []`, two `changed_symbols`, `degraded: true`, `reason: "no_data"` → the text "2 changed symbol(s), no downstream callers found.", the `no_data` badge, and no `heading`.
       4. "request failed": `api.get` rejects → "Could not load the blast radius.".
       5. "repo unknown": with `repoFullName={null}`, the text `src/routes/users.ts:10` is present and `queryByRole("link")` is null.
     - Render props everywhere: `prId="p1" repoFullName="acme/widgets" headSha="abc123"`.
   - Done when: `npm_config_verify_deps_before_run=false pnpm --dir client exec vitest run BlastRadiusCard` passes all flows, and `npm_config_verify_deps_before_run=false pnpm --dir client typecheck` passes.

6. Put the block on the Overview tab, under `IntentCard` and above the description.
   - Module: client
   - Files: modify `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx` · modify `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`
   - Change:
     - `OverviewTab`:
       - `OverviewTabProps` gains `repoFullName: string | null` and `headSha: string`;
       - render `<BlastRadiusCard prId={prId} repoFullName={repoFullName} headSha={headSha} />` right after `<IntentCard prId={prId} />` (Decision "Placement");
       - import from `"../BlastRadiusCard"`, the same style as the existing `"../IntentCard"` import.
     - `page.tsx:137`: `<OverviewTab prBody={pr.body} prId={prId} repoFullName={repoFullName} headSha={pr.head_sha} />`. Both values are already in scope and are passed the same way to `FindingsTab` (lines 148-149). The link SHA is the PR head (Decision "The link SHA is the PR head SHA").
   - Skills: react-best-practices, frontend-ui-architecture, typescript-expert, next-best-practices
     - react-best-practices: "Max 5-7 props" (`OverviewTab` ends at 4); "Lift Content Up" is not needed, plain props suffice.
     - frontend-ui-architecture: the block is composed by the tab that owns it.
     - next-best-practices: `page.tsx` stays a `"use client"` page with no new Server Component boundary.
   - Depends on: step 5
   - Tests: the step 5 tests; `client/src/test/smoke.test.tsx` stays green (it does not render `OverviewTab`).
   - Done when:
     - `npm_config_verify_deps_before_run=false pnpm --dir client typecheck` passes;
     - `npm_config_verify_deps_before_run=false pnpm --dir client build` passes;
     - with `./scripts/dev.sh` running, `/repos/<repoId>/pulls/482` (the seeded `acme/payments-api` PR, which has no index row) → Overview shows a "Blast radius" card under the intent card, with the `no_data` badge, the summary row at 0, and the `noDownstream` text.

7. Replace the stub handler of `devdigest_get_blast_radius` with a real read of `GET /pulls/:id/blast`.
   - Module: mcp-server (not in the planner's Module list; its typecheck is under Extra checks)
   - Files: modify `mcp-server/src/api/client.ts` · modify `mcp-server/src/tools/get-blast-radius.ts`
   - Change:
     - `client.ts`: add `getBlastRadius(pullRequestId: string): Promise<BlastRadius>` = `this.request<BlastRadius>('GET', \`/pulls/${encodeURIComponent(pullRequestId)}/blast\`)`. Place it after `listReviews`, and add `BlastRadius` to the type import. It is GET only, the same as its siblings.
     - `get-blast-radius.ts` keeps `GET_BLAST_RADIUS_TOOL`, `registerGetBlastRadius(server, deps)`, the `inputSchema` (`repository`, `pull_request_number`) and `annotations: { readOnlyHint: true, openWorldHint: false }`. It removes `STUB_TEXT` and the now-unused `toolError` import. Then:
       - `title: 'Blast radius of a pull request'`.
       - `description`: the spec's proposed text, verbatim. It is about 285 characters, under the 400 target (BP-03).
       - `BLAST_DEGRADED_REASONS = ['flag_off', 'index_failed', 'index_partial', 'repo_too_large', 'no_data'] as const satisfies readonly BlastDegradedReason[]`, with the comment used for `CONVENTION_CATEGORIES` in `get-conventions.ts:19`.
       - `outputSchema = z.object({…})` with these fields:
         - `repository: z.string()`
         - `pull_request_number: z.int()`
         - `changed_symbols: z.array(z.object({ name: z.string(), file: z.string(), kind: z.string() }))`
         - `downstream: z.array(z.object({ symbol: z.string(), callers: z.array(z.object({ name: z.string(), file: z.string(), line: z.int() })), endpoints_affected: z.array(z.string()), crons_affected: z.array(z.string()) }))`
         - `summary: z.string()`
         - `degraded: z.boolean().optional()`
         - `reason: z.enum(BLAST_DEGRADED_REASONS).optional()`
         - `message: z.string().nullable()`

         `type Output = z.infer<typeof outputSchema>`. The fields are the route's `BlastRadius` fields unchanged, so the agent sees the same map as the block, and there are no ids (BP-06).
       - The handler `runTool(GET_BLAST_RADIUS_TOOL, deps, …)` calls `resolveRepository(deps.api, repository)` → `deps.pulls.resolve(repo, pull_request_number)` → `deps.api.getBlastRadius(pr.id)`, then returns `toolResult<Output>(…)` (BP-09, BP-10).
         - Unknown repository or PR: a `ToolInputError` from the resolvers, with known values and an example.
         - API down, timeout, or the route's 404: `describeApiError`, through `runTool`.
       - Sanitising (BP-14): every `name`, `file`, `symbol` and every endpoint and cron string goes through `sanitizeText(value, TEXT_CAPS.title) ?? ''`. `kind`, `line`, `summary`, `degraded` and `reason` pass through. `degraded` and `reason` are copied only when present in the response.
       - `message`, built by a local `buildMessage(fullName, blast, cut)`, with `{repo}` = `repo.full_name`. These texts are decided here:
         - degraded, one text per reason (a `Record<BlastDegradedReason, (repo: string) => string>`):
           - `flag_off`: "Repository intelligence is off in DevDigest (REPO_INTEL_ENABLED), so callers come from a text search and endpoints are not attributed; treat this map as incomplete."
           - `index_failed`: "The last index of {repo} failed, so this map may be incomplete; ask the user to refresh the repository from its Pull requests page in DevDigest, then call again."
           - `index_partial`: "The index of {repo} is incomplete, so some callers may be missing; ask the user to refresh the repository from its Pull requests page in DevDigest, then call again."
           - `repo_too_large`: "{repo} is too large to index fully, so this map may be incomplete; treat a missing caller as unknown, not as absent."
           - `no_data`: "This map was not read from the index of {repo} (no usable index, or no changed files on record), so any callers come from a text search and endpoints are not attributed; ask the user to refresh the repository from its Pull requests page in DevDigest, then call again."
           - degraded with no reason: "This map may be incomplete; ask the user to refresh the repository from its Pull requests page in DevDigest, then call again."
         - not degraded, `changed_symbols` empty: "The changed files of this pull request declare no indexed symbols (for example only docs or config changed), so there is nothing downstream to check."
         - not degraded, `downstream` empty: "No code in {repo} calls the {n} changed symbol(s) of this pull request, so there are no downstream callers to check."
         - otherwise `null`.
         - When the size cut ran (below), append " Response size limit reached: showing {a} of {b} changed symbols and {c} of {d} downstream groups (highest rank first)." to the message, or use it alone when the message was `null`.
       - Size cap (BP-08), applied only when `JSON.stringify(output).length > MAX_STRUCTURED_CHARS`, with `MESSAGE_RESERVE_CHARS = 600` as a local constant:
         1. Drop `downstream` groups from the end (lowest rank) while the result with `changed_symbols: []` plus `MESSAGE_RESERVE_CHARS` is still over the cap and more than one group remains.
         2. Cut `changed_symbols` with `takePage(changedSymbols, { offset: 0, limit: changedSymbols.length, maxChars: MAX_STRUCTURED_CHARS - envelopeChars - MESSAGE_RESERVE_CHARS, key: 'blast' })`, and keep `page`. The comment says the tool has no cursor input, so `nextCursor` is ignored and the cut is reported in `message`.
   - Skills: typescript-expert, zod, security
     - typescript-expert: `satisfies` keeps the reason list in step with the vendored type; `z.infer` gives the `Output` type; no `any`.
     - zod: `schema-use-enums`; `object-optional-vs-nullable` (`degraded` / `reason` optional as in the contract, `message` nullable as in the sibling tools).
     - security: input is validated by the SDK; the only outbound request is a loopback GET with an `encodeURIComponent`-ed id; repository text is sanitised and capped before it reaches the agent.
     - `client.ts`: typescript-expert, security (zod is not routed to it: it has no `zod/v4` import).
   - Depends on: step 3
   - Tests: none. Tests for this module are deferred (`TESTING.md`); the manual MCP call is under Verification.
   - Done when:
     - `npm_config_verify_deps_before_run=false pnpm --dir mcp-server run typecheck` passes;
     - `server.ts` is unchanged and still registers exactly five tools (BP-04);
     - the manual call under Verification returns the same `downstream` and `summary` as the block for the same PR.

8. Update every text that calls the MCP tool a stub.
   - Module: mcp-server
   - Files: modify `mcp-server/src/instructions.ts` · modify `mcp-server/README.md` · modify `mcp-server/CLAUDE.md`
   - Change:
     - `instructions.ts`:
       - In the first sentence, add "the blast radius of a pull request," to the list after "a repository's coding conventions,".
       - Delete the line "- devdigest_get_blast_radius is a stub and returns no data yet.".
       - Extend the "Read-only:" line to end with ", devdigest_get_conventions, devdigest_get_blast_radius (what else a pull request's changes can affect: callers as file:line, HTTP endpoints, crons)."
       - The whole text stays ≤ 2,048 characters (BP-01).
     - `README.md`:
       - line 6: "and a blast-radius **stub**" → "and read a pull request's blast radius";
       - line 81, the data-path table row: `GET /repos` → `GET /repos/:id/pulls` (first time per PR) → `GET /pulls/:id/blast` | the API's GitHub PR sync inside `GET /repos/:id/pulls`;
       - line 100: replace "1,138 characters" with the new length (measured with the command in Done when);
       - lines 302-313: rewrite section "### 5. `devdigest_get_blast_radius`" (no "— stub") in the shape of section 4:
         - Purpose: read-only, no model call, the same map as the PR page's Blast radius block; `openWorldHint: false`.
         - Inputs.
         - Output fields.
         - Behaviour: the `message` cases and the size cut.
         - The call example and an illustrative JSON result.
       - line 619: remove "a real blast radius," from "Not implemented by design".
     - `CLAUDE.md` lines 5-6: "a blast-radius stub" → "a pull request's blast radius".
   - Skills: typescript-expert (`instructions.ts`, a text-only change to a string constant). `README.md` and `CLAUDE.md`: none routed.
   - Depends on: step 7
   - Tests: none (documentation and instructions text).
   - Done when:
     - `grep -rni "stub" mcp-server/src mcp-server/README.md mcp-server/CLAUDE.md` prints nothing about the blast tool;
     - `cd mcp-server && node_modules/.bin/tsx --eval "import('./src/instructions.ts').then((m) => console.log(m.SERVER_INSTRUCTIONS.length))"` prints a number ≤ 2048, and README line 100 shows that number;
     - `npm_config_verify_deps_before_run=false pnpm --dir mcp-server run typecheck` passes.

9. (P3, built by the owner's decision) Add a Resync button next to the incomplete-index badge; it refreshes the block once the index state advances.
   - Module: client
   - Files:
     - create, under `BlastRadiusCard/_components/ResyncButton/`: `ResyncButton.tsx`, `index.ts`, `constants.ts`, `hooks/useBlastResync.ts`
     - modify `BlastRadiusCard/BlastRadiusCard.tsx`, `BlastRadiusCard/BlastRadiusCard.test.tsx`, `client/messages/en/blast.json`, `OverviewTab/OverviewTab.tsx`, `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`
   - Change:
     - `blast.json`: add `"resync": { "start": "Resync index", "running": "Resyncing…", "timeout": "The resync did not finish in time. Check the API log." }`.
     - `constants.ts`: `RESYNC_POLL_TIMEOUT_MS = 150_000`, with the comment: "longer than the JobRunner's 120 s hard limit (`INDEX_SOFT_BUDGET_MS` comment in repo-intel/constants.ts), so a finished job is always seen first".
     - `hooks/useBlastResync.ts` is a component-internal orchestration hook (frontend-ui-architecture "hooks/ subfolder next to that component"). Signature: `useBlastResync(repoId: string, prId: string): { start: () => void; canStart: boolean; running: boolean; timedOut: boolean }`.
       - State: `attempt: { updatedAt: string; startedAt: number; expired: boolean } | null`.
       - `status = useRepoIntelStatus(repoId, attempt !== null && !attempt.expired)`. It reuses the existing 1.5 s poll; there is no new polling mechanism. The poll switch reads only state, because `status` is not known before this call.
       - `mutation = useResyncRepoIntel(repoId)`.
       - Derived during render:
         - `advanced = attempt !== null && status.data !== undefined && status.data.updatedAt !== attempt.updatedAt`;
         - `overdue = attempt !== null && !attempt.expired && !advanced && status.dataUpdatedAt - attempt.startedAt > RESYNC_POLL_TIMEOUT_MS`;
         - `running = attempt !== null && !attempt.expired`;
         - `timedOut = attempt?.expired === true`;
         - `canStart = status.data !== undefined && !running`.
       - `start`: `setAttempt({ updatedAt: status.data.updatedAt, startedAt: Date.now(), expired: false })`, then `mutation.mutate(undefined, { onError: () => setAttempt(null) })`. The mutation error itself is already toasted by `client/src/lib/providers.tsx`.
       - One `useEffect` on `[advanced, overdue, prId, qc]`:
         - when `advanced`: `qc.invalidateQueries({ queryKey: ["blast-radius", prId] })` and `setAttempt(null)`;
         - otherwise, when `overdue`: `setAttempt((a) => (a ? { ...a, expired: true } : a))`, which switches the poll off.
         - Its comment states the external system (the server's index state, observed by polling), and why `expired` is stored: it must switch off the poll that produced it.
     - `ResyncButton.tsx`, props `{ repoId: string; prId: string }`:
       - `<Button kind="ghost" size="sm" icon="RefreshCw" loading={running} disabled={!canStart} onClick={start}>`, labelled `t(running ? "resync.running" : "resync.start")`;
       - when `timedOut`, a muted `<span role="status">{t("resync.timeout")}</span>` next to it.
     - `BlastRadiusCard.tsx`:
       - gains the prop `repoId: string`;
       - when degraded, the `SectionLabel`'s `right` slot renders the badge followed by `<ResyncButton repoId={repoId} prId={prId} />`.
     - `OverviewTab.tsx` gains `repoId: string` and passes it on. `page.tsx` passes `repoId={repoId}`; it already holds the route param, which is the repo uuid used by `usePulls(repoId)`.
   - Skills: react-best-practices, frontend-ui-architecture, typescript-expert, next-best-practices
     - react-best-practices:
       - "Before each `useEffect`, ask: Is there an external system being synchronized?" Here it is the server's index state, and the effect is the only one.
       - `advanced`, `overdue`, `running`, `timedOut` and `canStart` are derived. The one stored flag, `expired`, feeds the poll switch.
       - The mutation's error handling sits in the event handler.
     - frontend-ui-architecture: the internal hook goes in a `hooks/` subfolder; constants are colocated.
     - next-best-practices: a `"use client"` leaf.
     - `BlastRadiusCard.test.tsx`: react-testing-library.
     - `blast.json`: none routed.
   - Depends on: step 6
   - Tests: add flow 6 to `BlastRadiusCard.test.tsx`, "Resync refreshes the block once the index advances". Its `api.get` is a `vi.fn` routed by path:
     - `/pulls/p1/blast`: first the `MAP` with `degraded: true, reason: "index_partial"`, then the `MAP` with `degraded: false`;
     - `/repos/r1/index-state`: first `{ status: "partial", updatedAt: "2026-01-01T00:00:00.000Z", … }`, then the same with `updatedAt: "2026-01-02T00:00:00.000Z"`;
     - `api.post` resolves `{ status: "accepted", jobId: "j1" }`.
     - Steps: click "Resync index" → `api.post` was called with `/repos/r1/resync` → the `index_partial` badge text disappears (`waitFor`). The invalidation inside `useResyncRepoIntel` refetches the index state at once, so no timers are needed.
   - Done when: `npm_config_verify_deps_before_run=false pnpm --dir client exec vitest run BlastRadiusCard` passes, including flow 6; `pnpm typecheck` and `pnpm build` pass in `client/` (same prefix).

10. (P3, built by the owner's decision) Make each changed symbol collapsible, like the design's tree.
    - Module: client
    - Files: modify `BlastRadiusCard/_components/DownstreamGroup/DownstreamGroup.tsx` · modify `BlastRadiusCard/_components/DownstreamGroup/styles.ts` · modify `BlastRadiusCard/BlastRadiusCard.test.tsx`
    - Change:
      - `DownstreamGroup` gets `const [open, setOpen] = React.useState(true)`, so every group starts expanded.
      - The header row becomes `<h3><button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={s.toggle}>`, containing the `ChevronDown` / `ChevronRight` icon, the mono symbol name, and the `callerCount` text at the right.
      - The callers list and both chip lists render only when `open`.
      - No new i18n key is needed: the button's accessible name is the symbol name plus the caller count.
    - Skills: react-best-practices, frontend-ui-architecture, typescript-expert, next-best-practices
      - react-best-practices: "Push State Down" (`open` lives in the group that uses it); Accessibility (a native `button` with `aria-expanded`, inside the heading).
      - frontend-ui-architecture: styles stay colocated.
      - next-best-practices: the file stays a `"use client"` leaf.
      - `BlastRadiusCard.test.tsx`: react-testing-library.
    - Depends on: step 5 (independent of step 9)
    - Tests:
      - Add flow 7, "a symbol collapses and expands": `userEvent` clicks `getByRole("button", { name: /rateLimit/ })` → the link `src/routes/users.ts:10` is gone and `aria-expanded="false"`; the `parseToken` group is still expanded; a second click shows the link again.
      - Flow 1 changes its heading query to `getByRole("heading", { name: /rateLimit/ })`, because the heading's accessible name now includes the caller count.
    - Done when: `npm_config_verify_deps_before_run=false pnpm --dir client exec vitest run BlastRadiusCard` passes, and `pnpm typecheck` passes in `client/`.

## Contracts and data
- Zod (`brief.ts`, both vendored copies, byte-identical):
  - new `BlastDegradedReason = z.enum(['flag_off', 'index_failed', 'index_partial', 'repo_too_large', 'no_data'])`;
  - `BlastRadius` = `{ changed_symbols: { name, file, kind }[]; downstream: { symbol; callers: { name; file; line: int }[]; endpoints_affected: string[]; crons_affected: string[] }[]; summary: string; degraded?: boolean; reason?: BlastDegradedReason }`;
  - `PrBrief` is unchanged and stays valid.
- Endpoint `GET /pulls/:id/blast` (module `blast`):
  - Params: `IdParams` (a uuid, otherwise 422).
  - Workspace-scoped through `getContext` + `container.reviewRepo.getPull`; an unknown or foreign PR gives 404 `Pull request not found`.
  - Response 200: `BlastRadius`, validated by the route's `response` schema. `degraded` is always present; `reason` is present only when degraded.
  - Exactly one `getBlastRadius` and one `getIndexState` call per request.
  - No LLM, no GitHub, no job. The default global rate limit applies.
  - One `info` log line, `'blast radius read'`, with `prId, indexStatus, changedFiles, symbols, callers, endpoints, crons, degraded, reason, ms`.
- MCP `devdigest_get_blast_radius`:
  - input unchanged (`repository`, `pull_request_number`);
  - output = `{ repository, pull_request_number }` + the `BlastRadius` fields + `message: string | null`;
  - `readOnlyHint: true`, `openWorldHint: false`.
- i18n: `client/messages/en/blast.json` gains `title`, `loading`, `loadError`, `chips.{endpoints,crons}` and `badge.{flag_off,index_failed,index_partial,repo_too_large,no_data,unknown}`. Step 9 adds `resync.{start,running,timeout}`.
- DB schema / migration: none.

## Verification
- Modules to typecheck and test. Prefix every command with `npm_config_verify_deps_before_run=false`:
  - `server`:
    - `pnpm --dir server typecheck`;
    - `pnpm --dir server test`. The `*.it.test.ts` files need Docker and are reported as skipped without it. `server/.env` must not hold an empty `LOG_LEVEL=` line (`server/insights.md` 2026-09-15).
  - `client`: `pnpm --dir client typecheck`; `pnpm --dir client test`.
- Extra checks:
  - `pnpm --dir client build`. Reason: `client/insights.md` 2026-09-25 — the build is the only check that catches a runtime import from `@devdigest/shared`.
  - `pnpm --dir mcp-server run typecheck`. Reason: root `insights.md` 2026-10-21 — `mcp-server` is outside the planner/implementer module list, so nothing else runs it.
  - Vendored drift: `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` prints nothing.
  - `limits-from-constants`, a reading check: `server/src/modules/blast/**` and `BlastRadiusCard/**` contain no `20` or `2` used as a caller cap or traversal depth, and no `slice` of callers. The only cap is `MAX_CALLERS_PER_SYMBOL` inside repo-intel, which is untouched.
  - No `pnpm db:generate`: there is no schema change.
  - Optional hermetic e2e: `cd e2e && npm run e2e:hermetic`. Reason: the PR page's default tab now fires one more GET. No flow asserts Overview content, so all flows should pass unchanged. It needs Docker and the `agent-browser` CLI; report it as unverified when they are missing.
  - Manual run, from the spec's Demo script:
    1. Run `./scripts/dev.sh`. If Postgres seems missing, check `docker --context default ps` (root `insights.md` 2026-09-29).
    2. Open seeded PR #482: the `no_data` state (badge, zero summary, empty text).
    3. Open the owner's test PR on a repository whose `GET /repos/<repoId>/index-state` answers `status: "full"`: at least two callers and at least one endpoint; clicking a `file:line` opens that line on GitHub.
    4. The API terminal shows one `blast radius read` line per request, with `indexStatus` and the counts, and no indexing or parse lines (`no-reparse`).
    5. Restart the MCP server (`/mcp` reconnect in Claude Code), ask for the blast radius of the same PR, and compare `downstream` and `summary` with the block.
- PR description draft (for whoever opens the PR):
  - What:
    - `GET /pulls/:id/blast` (module `server/src/modules/blast/`) maps the repo-intel facade's `BlastResult` to `BlastRadius`. It is a pure, unit-tested `toBlastRadius` with a Zod-validated response, and it has no LLM call, no GitHub call and no re-parse.
    - A Blast radius block on the Overview tab: a summary row, callers as GitHub `file:line` links, endpoint and cron chips, and an incomplete-index badge with its reason.
    - `devdigest_get_blast_radius` now returns the same map.
    - `BlastRadius` gains the optional `degraded` and `reason` fields in both vendored `brief.ts` copies.
  - Decisions:
    - The 20-caller cap is applied by the repo-intel facade to the whole callers list in rank order, not per symbol (`server/src/modules/repo-intel/service.ts:386`), so a PR with many changed symbols can leave some of them without callers.
    - A `partial` index is tagged `index_partial` by the route, because the facade reports it as not degraded.
    - The mapper drops callers in the declaring file.
    - Links use the PR head SHA, while the line numbers come from the last indexed commit.
    - No LLM summary.
  - Process: name the subagents and what each did — `planner` (this plan), `implementer`, `architecture-reviewer`, `plan-verifier`, plus any other that was invoked. Fill in plan-verifier's result summary before opening the PR.
  - Demo video: the author adds the link.

## Open questions
- `openWorldHint` of the blast tool — **decided by the owner: `false`**, as the spec's MCP section says. Known and accepted: the repo's own precedent points the other way (`devdigest_get_findings` uses `true` "because … the PR sync can reach GitHub", `mcp-server/README.md:211`), and the blast tool resolves a PR through the same `GET /repos/:id/pulls` sync. — affects: steps 7, 8 (no change)
- Where the reason-list check lives — the spec says to extend `contracts.test.ts` for "the reason list matching `DegradedReason`". Assumed: `contracts.test.ts` gets the runtime list check (step 1), and the two-way type check sits in `server/src/modules/blast/helpers.ts` (step 2), because `server/tsconfig.json` compiles only `src/**`, so a type assertion in `test/` would never be checked. — affects: steps 1, 2
- Duplicate caller rows — the spec lists "duplicate rows" as a test case without a rule. Assumed: keep the first row per (`viaSymbol`, `file`, caller `symbol`). That is the facade's own dedupe key and the count rule's (`file`, `name`) pair inside one group. — affects: step 2
- Shape of `degraded` / `reason` in the route response — assumed: `degraded` is always present (boolean), and `reason` is present only when degraded. The MCP tool copies both only when present. — affects: steps 2, 5, 7
- `no_data` wording — the spec requires it to read right with and without data. The same reason also covers a PR with no `pr_files` rows on a fully indexed repo. Assumed: badge text "Not read from the repository index: any callers come from a text search, endpoints are not attributed", which is true in all three cases. — affects: steps 4, 7
- Where the MCP message sends the user — assumed: "refresh the repository from its Pull requests page in DevDigest". That button exists today (`client/src/app/repos/[repoId]/pulls/page.tsx:96`, `POST /repos/:id/refresh`, which also enqueues an index refresh), while the block's Resync button (step 9) lives only on the PR page, which the agent cannot assume the user has open. — affects: step 7
- The test PR (`test-pr`, P1) — owner work. Assumed: the owner picks or opens a PR that changes an exported function used by at least two other files, on a repository whose index is `full`. The spec checked on 2026-10-21 that none of the six fork PRs is clearly such a change, and that `extractEndpoints` coverage of the chosen caller files is unverified. — affects: the demo of steps 2–6
- The incomplete-index demo — it needs a `repo_index_state` row with `status = 'partial'`, which is a write to the dev database; owner work. Assumed: until the owner does it, the `partial` path is shown by `server/test/blast.it.test.ts` case 1 and the badge flows in step 5. — affects: steps 3, 5 (demo only)
- Resync poll timeout (step 9) — assumed `RESYNC_POLL_TIMEOUT_MS = 150_000`, so a resync that never writes a new index row (no clone, failed enqueue) stops polling and shows the timeout text. — affects: step 9

## For reviewers
- Architecture:
  - `blast/routes.ts` stays thin (`getContext` → `service.blastRadius` → return) and has `params` and `response` schemas.
  - `blast/helpers.ts` is pure: type imports only, from `@devdigest/shared` and `../repo-intel/types.js`; no Fastify, DB, container or constants.
  - `blast/service.ts` reaches persistence only through `container.reviewRepo` and the facade only through `container.repoIntel`. `blast/` contains no `new` of a repository and no Drizzle.
  - Nothing under `server/src/modules/repo-intel/` changed.
  - Both `brief.ts` copies are byte-identical, and no other contract changed.
  - Client imports from `@devdigest/shared` are type-only.
  - `countBlast` exists twice by design (server and client). Confirm that both test files pin the de-duplication across groups.
  - `mcp-server` has no runtime import from `../server`, and `server.ts` still registers five tools.
- Security:
  - The new GET looks the PR up with `getPull(workspaceId, prId)` before the tenant-agnostic facade sees anything, and the repo id comes from the PR row. `server/test/blast.it.test.ts` pins the foreign-workspace 404 and that the facade is not called for it.
  - There is no new input besides the uuid param.
  - There is no outbound request from the server route: no GitHub, no LLM (`llmMock.calls` stays empty), and no job is enqueued.
  - On the fallback path the facade runs ripgrep over the clone on each request. The default global rate limit applies.
  - In the block, repository strings (paths, symbol names, endpoints) render as JSX text only. Every `href` comes from `githubBlobUrl` with the fixed `https://github.com` host and encoded path segments, and `MonoLink` sets `rel="noopener noreferrer"`.
  - In the MCP tool, every repository string is passed through `sanitizeText` and capped, the response stays within `MAX_STRUCTURED_CHARS`, and the tool sends GETs only.
