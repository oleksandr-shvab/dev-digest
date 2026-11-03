# Development Plan: Project Context

## Requirement
`specs/01-project-context.md` (SPEC-01, status approved; modules: server, client, reviewer-core).

Let a repo owner browse a repo's Markdown docs (read-only), attach them by path to an agent (Context tab) and to a skill ("Project context to use"), and see their token cost before a run. On every run the server reads the attached docs from the synced default-branch mirror at one commit, adds them to the prompt's `## Project context` as untrusted, delimited data within a per-run token budget, with no extra LLM call, and records the doc list, sizes, statuses and commit in the run trace.

## Requirement review
- Q: Where are the doc search globs configured? — A: Server env (`PROJECT_CONTEXT_GLOBS`, one global setting; default `**/{specs,docs,insights}/**/*.md`).
- Q: Hermetic e2e seeds `acme/payments-api` with no git mirror, so the 14 `Verify: e2e` ACs cannot run. How to get a mirror? — A: Fixture git repo created by `scripts/e2e.sh` and the CI workflow.
- Recommendation R1: read docs from git objects (`git ls-tree` + `git cat-file`) at one commit instead of walking the worktree — accepted — became steps 2, 5, 7 (AC-2 symlinks by mode `120000`, AC-28 one commit, by construction).
- Recommendation R2: keep `specs_read: string[]` and add an optional `project_context` trace field — accepted — became steps 2, 10, 16 (old stored traces still parse).
- Recommendation R3: add `picomatch` (and `@types/picomatch`) to `server` for glob matching — accepted — became step 6.
- Consequence of the fixture-repo answer: the mirror always exists in the hermetic stack, so AC-6 (empty state) and AC-12 ("Not found in <repo>") cannot be reached by an e2e flow. They are verified by component and integration tests instead (see Open questions).

## Execution mode
- Recommended: multi-agent — three modules, a new migration, shared Zod contracts in two vendored copies, four new endpoints, e2e infrastructure.
- Chosen by the user: multi-agent
- Work packages:
  | Package | Steps | Module | After | Parallel with |
  |---|---|---|---|---|
  | P1 | 1–2 | reviewer-core + vendored contracts (`server/src/vendor/shared`, `client/src/vendor/shared`) | — | — |
  | P2 | 3–10 | server | P1 | P3 |
  | P3 | 11–16 | client | P1 | P2 |
  | P4 | 17–18 | e2e + `scripts/` + `.github/workflows/e2e-web.yml` | P2, P3 | — |
- Then: `plan-verifier` (gate; code gaps back to `implementer`, at most two rounds) → `architecture-reviewer` ‖ `/code-review` → `test-writer` only for `S<n>.tests` gaps → `doc-writer` → `/pr-self-review`.

P2 and P3 touch disjoint files (P3 owns `client/src/vendor/ui/nav.ts`; P1 owns both `vendor/shared` copies). Run them in separate worktrees branched after P1.

## Out of scope
- Automatic doc selection by PR content (SPEC-01 non-goal).
- Editing, creating, uploading or foldering docs; the "coverage" ring; "Indexed … chunks"; embeddings.
- Per-repo attachment lists, per-repo search globs, reading docs from the PR head.
- Versioning of attachment changes; truncating a doc to fit the budget.
- Exposing project context through MCP tools (`mcp-server/`).
- Building any CI path that creates `source = 'ci'` runs. The executor only learns to honour a `ci` source (AC-30).
- A separate `## Project specifications` list in a skill body.
- Deleting the old `SpecFile` / `IndexStatus` contracts in `platform.ts` (left unused; only the two dead client hooks that call the never-served `/repos/:id/context` are removed).
- Updating `CLAUDE.md`, `docs/`, `insights.md` — `doc-writer` and the `engineering-insights` skill do that after implementation.

## Context
- Insights applied:
  - `insights.md` — 2026-10-29 — Project Context is half-built: `assemblePrompt` already renders `## Project context` from `PromptParts.specs`, `RunTrace` already has `specs_read` and `prompt_assembly.specs`, client `TraceBody` already shows both; the only missing producer is `run-executor.ts`. Extend these slots; do not add a parallel one (steps 1, 10, 16).
  - `insights.md` — 2026-10-28 — `vitest related` from the repo root ignores the module config and prints a false green. Run `pnpm --dir <module> exec vitest run <file>` (steps 1–18).
  - `insights.md` — 2026-09-24 — `pnpm <script>` may run an implicit install and fail. Every check below is run with `npm_config_verify_deps_before_run=false` (step 6 adds a dependency deliberately and is the one exception, see its text).
  - `server/insights.md` — 2026-09-15 — an empty env value (`LOG_LEVEL=`) fails `EnvSchema.parse` even for `.optional()` fields. The two new variables use the `z.preprocess` empty-to-undefined pattern already used for `PROMPT_LOG_DETAIL` (step 3).
  - `server/insights.md` — 2026-09-29 — `drizzle-kit generate` blocks forever on an add+drop pair in one call. This schema change only adds two columns, so one `pnpm db:generate` is safe (step 4).
  - `server/insights.md` — 2026-09-15 — `run_traces` is a separate table; a seeded trace needs its own `db.insert(t.runTraces)` for the same run id. The seed edit in step 10 extends the existing insert, nothing else.
  - `client/insights.md` — 2026-09-25 — importing a runtime value (not `import type`) from `@devdigest/shared` passes `tsc`/vitest but fails `pnpm build`. Client code imports types only from it and mirrors constants locally (steps 11–16; the production build is an extra check).
  - `client/insights.md` — 2026-09-25 — keyboard reorder with `@dnd-kit/sortable` under jsdom needs `getBoundingClientRect` stubbed with distinct rects and `.focus()` wrapped in `act()`. Follow `SkillsTab.test.tsx` (step 12).
  - `client/insights.md` — 2026-10-08 — a shared component that starts using a new `next-intl` namespace needs that namespace in every existing test that renders it (step 12, 13, 14, 16).
- Constraints applied:
  - `reviewer-core` has no fs/DB/network imports; reading docs lives in `server` and only resolved `{ path, text }` values cross into the engine — `reviewer-core/CLAUDE.md`.
  - Every LLM-bound external string goes inside an `<untrusted>` block — `reviewer-core/CLAUDE.md`.
  - The engine call and prompt assembly stay in `reviewer-core`; `server` only orchestrates — `server/CLAUDE.md`.
  - Every route uses `getContext()` and Zod validation; cross-module access goes through the container — `server/CLAUDE.md`, `project-rules` rule 6.
  - Shared Zod contracts are edited in both `server/src/vendor/shared` and `client/src/vendor/shared` — root `CLAUDE.md`, `project-rules` rule 3.
  - Schema changes go through `pnpm db:generate`, never hand-written SQL — root `CLAUDE.md`.
  - Review is never auto-triggered; nothing here starts a review — root `CLAUDE.md`, `project-rules` rule 1.
  - e2e stays deterministic (no LLM, no network) — `e2e/CLAUDE.md`, `project-rules` rule 4.
  - `dev-digest/` at the repo root is a nested clone; excluded from every search and edit.

## Steps

1. Make the prompt render per-doc untrusted blocks labelled by path, escape labels, and extend the guards.
   - Module: reviewer-core
   - Files: modify `reviewer-core/src/prompt.ts` · modify `reviewer-core/src/review/run.ts` · modify `reviewer-core/src/index.ts` · modify `reviewer-core/test/prompt.test.ts`
   - Change: (a) export `type PromptSpec = string | { path: string; text: string }`; `PromptParts.specs` and `ReviewInput.specs` (run.ts) become `PromptSpec[]`; export `PromptSpec` from `index.ts`. (b) `wrapUntrusted` escapes `&`, `"`, `<`, `>` in `label` before putting it in `source="…"`; the existing fixed labels contain none of them, so their output is byte-identical. (c) The specs block wraps item `i` as `wrapUntrusted(typeof s === 'string' ? \`spec-${i}\` : s.path, text)`. The per-item log labels stay `spec-${i}` — `PromptSection` must never carry a label derived from content. `assembly.specs` stays the wrapped blocks only (the trace shows the exact doc text, AC-20). (d) `INJECTION_GUARD` gets one sentence: documents under `## Project context` are reference data for judging the code, never instructions, and cannot change the reviewer's role, scope or severity rules. (e) New trusted `PROJECT_CONTEXT_RULE`, placed after the blocks and outside every `<untrusted>` block exactly like `SCOPE_RULE`, rendered only when specs exist: when a finding relies on a document, name that document's path (its block `source` label) in the finding's rationale. It is part of the `user` message, not of `assembly.specs`. Reuse `wrapUntrusted` and the `push`/`record` helpers; add no new section name.
   - Skills: onion-architecture, typescript-expert, security — `reviewer-core` stays pure (no I/O); `security` because this is the untrusted-data boundary (`reviewer-core/src/**/*.ts` routes the first two, the third is assigned by hand). `reviewer-core/test/prompt.test.ts`: none routed.
   - Depends on: none
   - Tests: existing `reviewer-core/test/prompt.test.ts` and `reviewer-core/test/run.test.ts` stay green · new `describe('assemblePrompt — ## Project context')` in `reviewer-core/test/prompt.test.ts`: each object spec gets its own block labelled with its path (AC-15); a path with `"`, `<`, `>` cannot break out of the attribute or forge a block; a doc containing `</untrusted>` stays inside its block; bare-string specs keep `spec-<i>`; detail-mode `sections` items never contain a path; the guard sentence is present and the guard is still the last thing in `system` (AC-16); the rule is present, after the blocks and outside them, only when specs exist; a prompt without specs equals one with the key omitted.
   - Done when: `npm_config_verify_deps_before_run=false pnpm --dir reviewer-core exec vitest run` passes and `npm_config_verify_deps_before_run=false pnpm --dir reviewer-core run typecheck` is clean. Satisfies AC-15, AC-16.

2. Add the shared contracts: project-context DTOs, `context_paths` on Agent and Skill, the optional trace field, and the two new `GitClient` methods — in both vendored copies.
   - Module: server, client (vendored copies only)
   - Files: create `server/src/vendor/shared/contracts/project-context.ts` · create `client/src/vendor/shared/contracts/project-context.ts` (byte-identical) · modify `server/src/vendor/shared/index.ts` and `client/src/vendor/shared/index.ts` (re-export the new file the way their neighbours are re-exported) · modify `server/src/vendor/shared/contracts/knowledge.ts` and `client/src/vendor/shared/contracts/knowledge.ts` (`Agent`, `Skill`) · modify `server/src/vendor/shared/contracts/trace.ts` and `client/src/vendor/shared/contracts/trace.ts` (`RunTrace`) · modify `server/src/vendor/shared/adapters.ts` and `client/src/vendor/shared/adapters.ts` (`GitClient`) · modify `server/test/contracts.test.ts`
   - Change: shapes are listed under "Contracts and data". `Agent.context_paths` and `Skill.context_paths` are `z.array(z.string()).default([])`. `RunTrace.project_context` is optional, so every stored trace still parses. `GitClient` gains `listTree` and `readBlobs` plus the `GitTreeEntry` type. `AttachmentPath` is the single definition of a valid attached path (repo-relative, `.md`, no leading `/`, no backslash, no NUL or control characters, no empty/`.`/`..` segment, no `.git` or `node_modules` segment, at most 512 characters); the server imports it at runtime for the content endpoint and for the attachment bodies. Edit the two copies of every file in this step together; `adapters.ts` and `knowledge.ts` already differ between copies, so change each in place instead of copying one over the other.
   - Skills: zod, security — vendored contracts rule routes `zod`; `security` because `AttachmentPath` validates user input (assigned by hand). `typescript-expert` also routes to `server/src/vendor/**` through the server rules, apply it to the `adapters.ts` interface.
   - Depends on: none
   - Tests: existing `server/test/contracts.test.ts` · extend it: `AttachmentPath` accepts `specs/a.md`, `docs/x/y.MD`, rejects `/etc/passwd.md`, `../a.md`, `a/../b.md`, `a\\b.md`, `.git/x.md`, `node_modules/x/docs/a.md`, `a.txt`, an empty string and a 513-character path; `SetContextPathsInput` rejects more than 200 paths; `RunTrace` parses a trace with no `project_context` and one with it; `Agent` and `Skill` parse without `context_paths` and default it to `[]`; `ProjectContextList` parses a sample.
   - Done when: `npm_config_verify_deps_before_run=false pnpm --dir server exec vitest run test/contracts.test.ts` passes; `diff server/src/vendor/shared/contracts/project-context.ts client/src/vendor/shared/contracts/project-context.ts` prints nothing; typecheck of reviewer-core and client may now report missing `context_paths` in fixtures — those are fixed in the owning package (steps 9, 11–16), not here. Satisfies AC-9 (shape), AC-2 (validation half).

3. Add server configuration for the search globs and the per-run budget.
   - Module: server
   - Files: modify `server/src/platform/config.ts` · modify `server/.env.example` · create `server/test/project-context-config.test.ts`
   - Change: `EnvSchema` gains `PROJECT_CONTEXT_GLOBS` (string, empty treated as unset via `z.preprocess` like `PROMPT_LOG_DETAIL`) and `PROJECT_CONTEXT_BUDGET_TOKENS` (empty treated as unset, then `z.coerce.number().int().positive()`). `AppConfig` gains `projectContextGlobs: string[]` and `projectContextBudgetTokens: number`. Globs are split on `;` (not `,`, because the default contains a brace list), trimmed, empties dropped; defaults `['**/{specs,docs,insights}/**/*.md']` and `20000`. Export the default glob as a named constant. Document both variables, with the separator, in `.env.example`.
   - Skills: fastify-best-practices, onion-architecture, typescript-expert, zod — `server/src/platform/config.ts` is in the HTTP rule and imports zod. `.env.example` and the test: none routed.
   - Depends on: none
   - Tests: new `server/test/project-context-config.test.ts`: defaults; `a;b` split; empty string means default; `PROJECT_CONTEXT_BUDGET_TOKENS=''` means 20000; `0` and `abc` are rejected.
   - Done when: `npm_config_verify_deps_before_run=false pnpm --dir server exec vitest run test/project-context-config.test.ts` passes.

4. Add `context_paths` to the `agents` and `skills` tables and generate the migration.
   - Module: server
   - Files: modify `server/src/db/schema/agents.ts` · modify `server/src/db/schema/skills.ts` · create (generated) `server/src/db/migrations/0015_*.sql` and its `meta/` snapshot
   - Change: in both tables add `contextPaths: jsonb('context_paths').$type<string[]>().notNull().default(sql\`'[]'::jsonb\`)` (same precedent as `skills.evidenceFiles`). Then run `pnpm --dir server db:generate` once. Do not edit the SQL by hand. `snapshotVersion` in the agents repository and the skill-version snapshots are deliberately left untouched: attachments are not part of a version (AC-9).
   - Skills: onion-architecture, typescript-expert, drizzle-orm-patterns, postgresql-table-design — `server/src/db/schema/**` matches the layering, persistence and schema rules. Migration SQL: none routed.
   - Depends on: none
   - Tests: none of their own; the migration is exercised by every Testcontainers test in steps 8–10.
   - Done when: `db:generate` writes exactly one new `0015_*.sql` containing two `ALTER TABLE … ADD COLUMN "context_paths" jsonb DEFAULT '[]'::jsonb NOT NULL` statements and no other statement, and `npm_config_verify_deps_before_run=false pnpm --dir server run typecheck` reports no error caused by this step.

5. Implement `listTree` and `readBlobs` in the git adapter and the mock.
   - Module: server
   - Files: modify `server/src/adapters/git/simple-git.ts` · modify `server/src/adapters/mocks.ts` · create `server/test/git-tree.test.ts`
   - Change: `SimpleGitClient.listTree(repo, ref)` runs `git ls-tree -r -l -z <ref>` in `clonePathFor(repo)` and parses NUL-separated records into `GitTreeEntry { path, mode, blob, size }`, keeping only `blob` entries (submodule `commit` entries dropped); the mode is kept so callers can reject `120000` symlinks. `ref` must match `/^[0-9a-f]{40}$/`, otherwise throw `ValidationError`. `SimpleGitClient.readBlobs(repo, blobs)` spawns `git cat-file --batch` with `node:child_process` (simple-git cannot feed stdin) in the clone dir, validates every sha against `/^[0-9a-f]{40}$/` before writing it, writes one sha per line, parses the framed output (`<sha> blob <size>\n<bytes>\n`, `<sha> missing\n`) and returns `Map<sha, Buffer | null>`; the child is killed after a fixed timeout constant. `MockGitClient`: `files` becomes `Record<string, string | Buffer>`; a new `symlinks?: string[]` option; `listTree` builds entries from `files` (mode `100644`) plus `symlinks` (mode `120000`) with a synthetic blob id per path; `readBlobs` resolves ids back to content. Existing `readFile`/`diff` behaviour is unchanged.
   - Skills: onion-architecture, typescript-expert, security — adapter layer (I/O allowed); `security` by hand because the adapter spawns a process with externally derived arguments. `server/test/git-tree.test.ts`: none routed.
   - Depends on: step 2 (interface and `GitTreeEntry`)
   - Tests: new `server/test/git-tree.test.ts` builds a throwaway repo in `os.tmpdir()` with `git init`: a regular `specs/a.md`, `node_modules/x/docs/README.md`, a symlink `specs/evil.md -> /etc/passwd`, a non-UTF-8 `docs/bin.md`; asserts `listTree` returns the symlink with mode `120000` and the others as `100644`, `readBlobs` returns exact bytes (including the non-UTF-8 file) and `null` for an unknown sha, and rejects a malformed ref or sha; one case with 1,000 small `.md` files asserts `listTree` plus one `readBlobs` finish in under 2,000 ms.
   - Done when: `npm_config_verify_deps_before_run=false pnpm --dir server exec vitest run test/git-tree.test.ts` passes. Satisfies AC-2 (adapter half), AC-28 (read by sha).

6. Add the `picomatch` dependency and the pure helpers of the project-context module.
   - Module: server
   - Files: modify `server/package.json` and `server/pnpm-lock.yaml` · create `server/src/modules/project-context/constants.ts` · create `server/src/modules/project-context/helpers.ts` · create `server/test/project-context-helpers.test.ts`
   - Change: run `pnpm --dir server add picomatch` and `pnpm --dir server add -D @types/picomatch` (picomatch 4.0.4 is already in the lockfile transitively; if the registry is unreachable try `--offline`, and if that fails report it — do not hand-edit the lockfile). `constants.ts`: `MAX_LISTED_DOCS = 1000`, `EXCLUDED_SEGMENTS = ['.git', 'node_modules']`, `REGULAR_FILE_MODES = ['100644', '100755']`, `TOKEN_CACHE_MAX = 5000`. `helpers.ts` (pure, no I/O): `isEligibleEntry(entry)` (regular file mode, ends in `.md`, no excluded segment); `compileGlobs(globs)` (picomatch with `dot: true`); `selectDocs(entries, matcher)` (eligible and matching, sorted by path); `docTypeFor(path)` (the matched folder nearest the file among `specs`/`docs`/`insights`); `decodeUtf8(buf): string | null` (fatal decoder, `null` on invalid); `orderAttachedPaths(own, perSkill)` (own first, then each enabled skill's paths in the given order, first occurrence wins — AC-14); `planBudget(docs, budget)` (walk in order, skip a whole doc that would exceed the budget, continue with the next — AC-18); `countUsedBy(agents, links)` (distinct agents per path, directly attached or through an enabled link — AC-5). Export the `CollectedDoc` type (`{ path, tokens, status, text? }`).
   - Skills: onion-architecture, typescript-expert — `server/src/modules/**/helpers.ts`. `package.json`, lockfile and the test: none routed.
   - Depends on: step 2
   - Tests: new `server/test/project-context-helpers.test.ts`: default glob picks `specs/a.md`, `a/docs/b/c.md`, `insights/x.md` and not `README.md`, `docs/a.txt`, `node_modules/foo/docs/README.md`, `.git/docs/x.md`; a custom glob list works; `docTypeFor('specs/docs/a.md')` is `docs`; `decodeUtf8` returns `null` for `0xff 0xfe` bytes; `orderAttachedPaths` dedupes with first-wins across own and two skills; `planBudget` skips a 25k doc, then still includes a later 1k doc, and always skips a single doc larger than the budget; `countUsedBy` counts an agent once when it has the path directly and through a skill.
   - Done when: `npm_config_verify_deps_before_run=false pnpm --dir server exec vitest run test/project-context-helpers.test.ts` passes and `git diff --stat server/package.json server/pnpm-lock.yaml` shows only `picomatch` and `@types/picomatch`.

7. Add the repository and service of the project-context module (list, read, collect).
   - Module: server
   - Files: create `server/src/modules/project-context/repository.ts` · create `server/src/modules/project-context/service.ts` · create `server/test/project-context-collect.test.ts`
   - Change: `ProjectContextRepository(db)`: `getRepo(workspaceId, repoId)` (workspace-scoped read of `repos`) and `attachmentsForUsage(workspaceId)` returning the workspace's agents' `contextPaths` and, separately, `{ agentId, contextPaths }` for every `agent_skills` link whose link flag and skill flag are both enabled (two queries, no N+1). `ProjectContextService(container)` with: `listDocs(workspaceId, repoId)` → `ProjectContextList`: resolve the repo (404 `NotFoundError` if absent), take `commit = git.currentHead`, `listTree(commit)`, `selectDocs` against `container.config.projectContextGlobs`, cap at `MAX_LISTED_DOCS` by path with the true `total`, read the listed blobs in one `readBlobs` call, tokens via `container.tokenizer.count` memoised by blob sha (map capped at `TOKEN_CACHE_MAX`), `used_by` from `countUsedBy`; `status` is `no_mirror` when any git call throws (the mirror existence is decided by the git call, not by `repos.clone_path`), `no_matches` when nothing matches, otherwise `ok`; `scanned_at` is now; `budget_tokens` from config. `readDoc(workspaceId, repoId, path)`: parse with `AttachmentPath`, resolve the path in the same eligible tree entries (no filesystem path is ever joined), `NotFoundError` if absent or undecodable. `collectForRun({ repo, paths })` → `{ commit, docs: CollectedDoc[] }`, never throws: resolve one commit, one `listTree`, one `readBlobs` for the requested paths; a path counts as present when it is an eligible entry (globs are not re-applied, so an attachment survives a glob change); absent, unreadable or non-UTF-8 → `missing`; then `planBudget` against `projectContextBudgetTokens` using the doc text's token count; if the mirror cannot be read, every path is `missing` and `commit` is `null`.
   - Skills: onion-architecture, typescript-expert, drizzle-orm-patterns (repository.ts), security (service reads user-chosen paths) — `repository.ts` matches the persistence rule.
   - Depends on: steps 3, 4, 5, 6
   - Tests: new `server/test/project-context-collect.test.ts` (no database: `new Container(loadConfig(...), {} as never, { git, tokenizer })` with `MockGitClient` and a stub tokenizer, as the container already supports overrides): AC-17 (missing path, symlink path, non-UTF-8 file → `missing`, others `included`); AC-18 with `PROJECT_CONTEXT_BUDGET_TOKENS` small (whole doc skipped, a later smaller doc included); AC-28 (`listTree` and `readBlobs` called with the same sha as `currentHead` returned, and that sha is returned); mirror failure → all `missing`, `commit: null`; the token cache avoids re-counting an unchanged blob sha.
   - Done when: `npm_config_verify_deps_before_run=false pnpm --dir server exec vitest run test/project-context-collect.test.ts` passes. Satisfies AC-1, AC-2, AC-5, AC-6, AC-17, AC-18, AC-28, AC-29 (logic; HTTP in step 8).

8. Expose the list and content endpoints and register the module.
   - Module: server
   - Files: create `server/src/modules/project-context/routes.ts` · modify `server/src/modules/index.ts` · modify `server/src/platform/container.ts` · create `server/test/project-context.it.test.ts`
   - Change: `routes.ts` (transport only): `GET /repos/:id/context/docs` → `ProjectContextList`; `GET /repos/:id/context/docs/content` with query `path` (validated with `AttachmentPath`) → `ProjectContextDocContent`. Both call `getContext()` first and pass `workspaceId` to the service. Register the plugin as `projectContext` in `modules/index.ts`. `Container` gets a lazy `projectContext` getter (`new ProjectContextService(this)`) next to `repoIntel`, so the run executor reaches the service through the container, not through another module's folder.
   - Skills: fastify-best-practices, onion-architecture, typescript-expert, security — a new endpoint with user input (`routes.ts`, `modules/index.ts` are in the HTTP rule). `container.ts`: onion-architecture, typescript-expert.
   - Depends on: step 7
   - Tests: new `server/test/project-context.it.test.ts` (Testcontainers; `buildApp` with `MockGitClient`, the pattern in `server/test/agents-skills.it.test.ts`): list returns paths, types, sizes, tokens (AC-1); `node_modules/foo/docs/README.md` and a mock symlink are not listed, and `?path=../../etc/passwd.md` and the symlink path are rejected/404 (AC-2); a repo in another workspace returns 404; `no_mirror` when `MockGitClient` throws, `no_matches` with only `README.md` (AC-6, API half); 1,001 matching mock files return 1,000 docs with `total` 1,001 (AC-29); `used_by` counts an agent attached directly and one through an enabled linked skill but not through a disabled link (AC-5, filled in once step 9 exists).
   - Done when: `npm_config_verify_deps_before_run=false pnpm --dir server exec vitest run test/project-context.it.test.ts` passes with Docker available (Testcontainers). Satisfies AC-1, AC-2, AC-5, AC-6, AC-29.

9. Add the attachment endpoints for agents and skills and the `context_paths` DTO field.
   - Module: server
   - Files: modify `server/src/modules/agents/{repository,service,routes,helpers}.ts` · modify `server/src/modules/skills/{repository,service,routes,helpers}.ts` · modify `server/test/project-context.it.test.ts`
   - Change: `PUT /agents/:id/context` and `PUT /skills/:id/context`, body `SetContextPathsInput`, response the updated `Agent` / `Skill`. Repository methods `setContextPaths(workspaceId, id, paths)` do a plain workspace-scoped `UPDATE … SET context_paths` — no `version` bump, no `snapshotVersion`, no `skill_versions` row, `updated_at` untouched (AC-9). The service dedupes the list (first wins) and keeps the given order. `toAgentDto` and `toSkillDto` add `context_paths`. `isConfigChange` and `planSkillUpdate` stay as they are, so `PUT /agents/:id` and `PUT /skills/:id` neither read nor clear the column. Fix existing test fixtures that build `Agent`/`Skill` literals only by adding `context_paths: []`; do not change their assertions.
   - Skills: fastify-best-practices (routes), drizzle-orm-patterns (repositories), onion-architecture, typescript-expert, security (endpoints with user input), zod (the routes import zod) — `server/src/modules/**` routing; the project already keeps links and versions logic in the agents/skills repositories, follow `setSkillItems` for the workspace-scoped, row-lock style but without the version bump.
   - Depends on: steps 2, 4
   - Tests: existing `server/test/agents-skills.it.test.ts`, `server/test/agents-versions.it.test.ts`, `server/test/skills.it.test.ts` stay green · extend `server/test/project-context.it.test.ts`: after `PUT /agents/:id/context` the agent `version` and `GET /agents/:id/versions` length are unchanged and the stored value is the path list (AC-9); same for a skill's `version` and `GET /skills/:id/versions`; a path like `../x.md` and a 201-path list return 422; an agent of another workspace returns 404; `PUT /skills/:id` with a new body keeps `context_paths`; the list in the response keeps the sent order and drops duplicates.
   - Done when: the extended `server/test/project-context.it.test.ts` and the three existing test files above pass; `npm_config_verify_deps_before_run=false pnpm --dir server run typecheck` is clean. Satisfies AC-9, AC-7/AC-8 (persistence half).

10. Collect project context in the run executor, record it in the trace, and extend the seed.
    - Module: server
    - Files: modify `server/src/modules/reviews/run-executor.ts` · modify `server/src/db/seed.ts` · create `server/test/project-context-run.it.test.ts`
    - Change: `executeRuns` jobs accept an optional `source?: 'local' | 'ci'` (default `'local'`, threaded to `runOneAgent`); `ReviewService.runReview` is not changed. In `runOneAgent`, after `skillLinks` is computed: when `source === 'ci'`, skip collection, log one info line, and send no specs (AC-30); otherwise `paths = orderAttachedPaths(agent.contextPaths, skillLinks.map((l) => l.skill.contextPaths))` (the links are already filtered to enabled-and-enabled by `activeSkillLinks`, AC-14), call `this.container.projectContext.collectForRun({ repo, paths })`, log a one-line summary (counts and tokens, never text), and pass `specs: included.map(({ path, text }) => ({ path, text }))` to `reviewPullRequest` only when something was included. The trace gets `config.source` from the job source, `specs_read` = included paths, and `project_context: { commit, docs: [{ path, tokens, status }] }` when at least one path was attached and the run is local; otherwise the field is omitted. No other LLM call is added anywhere (AC-21). The failure trace in `traceFromBuffer` is unchanged. In `seed.ts`, extend the existing Security Reviewer `run_traces` insert: `specs_read: ['specs/security-baseline.md']`, `project_context` with commit `a1b2c3d4e5f60718293a4b5c6d7e8f9012345678` and three docs — `specs/security-baseline.md` `included`, `docs/data-retention.md` `skipped_budget`, `specs/removed-doc.md` `missing` — and a `prompt_assembly.specs` string holding the `<untrusted source="specs/security-baseline.md">…</untrusted>` block that matches the included doc.
    - Skills: onion-architecture, typescript-expert, security (untrusted docs flow into a prompt) — `run-executor.ts` and `seed.ts` match the layering rule.
    - Depends on: steps 1, 7, 8, 9
    - Tests: existing `server/test/reviews.it.test.ts`, `server/test/prompt-log-run.test.ts` stay green · new `server/test/project-context-run.it.test.ts` (Testcontainers; the review is started the way `reviews.it.test.ts` does, with `MockGitClient({ files, head })` and `MockLLMProvider`): order is own docs then each enabled skill's docs with a duplicate sent once and a disabled skill's docs absent (AC-14); the trace's `prompt_assembly.specs` holds one `<untrusted source="specs/…">` block per included doc (AC-15, AC-20); a missing and a non-UTF-8 attached doc are `missing` and the run still ends `done` (AC-17); with a small `PROJECT_CONTEXT_BUDGET_TOKENS` a large doc is `skipped_budget` and a later small one `included` (AC-18); `MockLLMProvider.calls` has the same length as for the same run with no attachments (AC-21); `project_context.commit` equals the mock head (AC-28); calling the executor directly with `source: 'ci'` (built the way `ReviewService` builds it, `service.ts:48`) yields no specs in the prompt, no `project_context`, and `config.source === 'ci'` (AC-30).
    - Done when: `npm_config_verify_deps_before_run=false pnpm --dir server exec vitest run test/project-context-run.it.test.ts test/reviews.it.test.ts test/prompt-log-run.test.ts` passes and `npm_config_verify_deps_before_run=false pnpm --dir server run typecheck` is clean. Satisfies AC-14, AC-15, AC-17, AC-18, AC-19 (data), AC-20 (data), AC-21, AC-28, AC-30.

11. Add the client hooks for project context and remove the two dead hooks.
    - Module: client
    - Files: create `client/src/lib/hooks/project-context.ts` · modify `client/src/lib/hooks/index.ts` · modify `client/src/lib/hooks/core.ts` · modify `client/src/lib/types.ts` (only if it re-exports contract types)
    - Change: `useProjectContextDocs(repoId)` (`GET /repos/:id/context/docs`, disabled without a repo), `useProjectContextDoc(repoId, path)` (`GET …/content?path=`, disabled without a path), `useSetAgentContext(agentId)` and `useSetSkillContext(skillId)` (`api.put` to `/agents/:id/context` and `/skills/:id/context`; optimistic update of the cached agent or skill with rollback on error, and invalidation of the docs list so "Used by" refreshes and of the agent-skills query so inherited rows refresh). Import types only from `@devdigest/shared` (`import type`). Delete `useContextFiles` and `useReindexContext` from `core.ts` and any import that becomes unused.
    - Skills: react-best-practices, frontend-ui-architecture, typescript-expert — `client/src/**/*.ts`; the data-fetching-through-hooks convention is in `client/CLAUDE.md`.
    - Depends on: step 2
    - Tests: none of their own; exercised by the component tests in steps 12–16 (hooks are mocked or run against a mocked `api`).
    - Done when: `npm_config_verify_deps_before_run=false pnpm --dir client run typecheck` has no error from these files.

12. Build the shared `ContextDocPicker` component.
    - Module: client
    - Files: create `client/src/components/context-doc-picker/{ContextDocPicker.tsx,index.ts,helpers.ts,constants.ts,styles.ts}` · create `client/src/components/context-doc-picker/_components/DocRow/` and `_components/DocPreviewModal/` (component, `index.ts`, `styles.ts` each) · create `client/src/components/context-doc-picker/ContextDocPicker.test.tsx` · create `client/src/components/context-doc-picker/helpers.test.ts`
    - Change: used by two features (agent tab and skill tab), so it lives in `src/components/` per the promotion rule. Props: `variant: 'agent' | 'skill'`, `title`, `helper`, `repo: { id; full_name } | null`, `docs`/`isLoading`/`isError`, `attached: string[]`, `inherited?: { path; via }[]`, `onChange(paths)`, `saving`, optional `footer` node. Rows: attached docs first in their order (drag handle with pointer and keyboard sensors as in the agent `SkillsTab`; dragging off while a filter is active), then the unattached docs by path; each row has a checkbox, filename, folder, type badge (text), `≈ N tokens` (AC-27), and a Preview control (a text button for `agent`, an eye icon button for `skill`), every control with an accessible name that includes the path. Ticking appends the path; unticking removes it; both call `onChange` immediately (AC-7, AC-8). An attached path that is absent from a loaded `docs` list renders as an attached row marked "Not found in {repo.full_name}" that can still be detached (AC-12). With `repo === null` the list shows "Select a repo to see its docs" above the attached paths, which stay detachable (AC-24). A filter input narrows rows by path. Save errors are announced through an `aria-live` region. The Preview modal renders the doc through the existing `Markdown` primitive and returns focus to its trigger on close. `helpers.ts` holds pure functions: `buildRows`, `totalTokens`, `planBudget(orderedDocs, budget)` (same rule as the server: skip a whole doc that would exceed the budget, continue) and `serializePreview(paths)` (`## Project context` then `- <path>` lines, no text — AC-13). Strings come from `useTranslations("context")`; add the keys to `client/messages/en/context.json`, replacing its stale keys (`chunks`, `reindex`, `indexStatus`, `empty` text about `.devdigest/specs/`) with the keys steps 12–15 use. Type-only imports from `@devdigest/shared`; mirror constants locally.
    - Skills: react-best-practices, frontend-ui-architecture, typescript-expert; tests: react-testing-library — `client/src/**/*.tsx` and `client/**/*.test.tsx` routing. `client/messages/en/context.json`: none routed.
    - Depends on: step 11
    - Tests: new `ContextDocPicker.test.tsx` (use `client/src/test/render.tsx`; follow `SkillsTab.test.tsx` for the dnd-kit keyboard reorder with stubbed rects and `act()`): tick/untick calls `onChange` with the new order; keyboard reorder calls `onChange` with the moved order; not-found row; no-repo notice; filter; the preview trigger and accessible names; token text on a row · new `helpers.test.ts`: `planBudget` cases identical to step 6's (including the later-smaller-fits case), `totalTokens`, `serializePreview` contains no doc text.
    - Done when: `npm_config_verify_deps_before_run=false pnpm --dir client exec vitest run src/components/context-doc-picker` passes. Satisfies AC-7, AC-8, AC-12, AC-13 (helper), AC-24, AC-27.

13. Add the agent editor's Context tab.
    - Module: client
    - Files: create `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/{ContextTab.tsx,index.ts,styles.ts}` · create `…/ContextTab/ContextTab.test.tsx` · modify `client/src/app/agents/[id]/_components/AgentEditor/constants.ts` · modify `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx` · modify `client/src/app/agents/[id]/page.tsx` · modify `client/messages/en/agents.json`
    - Change: add `{ key: "context", labelKey: "editor.tabs.context", icon: "FileText" }` to `TABS` after Skills, add `"context"` to `VALID_TABS` in `page.tsx`, and render `<ContextTab agent={agent} />` for it. `ContextTab`: repo from `useActiveRepo()`, docs from `useProjectContextDocs(repo?.id)`, inherited rows from `useAgentSkills(agent.id)` (links whose link flag and skill flag are enabled, in order, each skill's `context_paths` minus paths already attached or already inherited), saves through `useSetAgentContext`. Header "Project context" with an "N of M attached" badge and the helper text from the spec; inherited rows are read-only and marked "via {skill name}" and count in the total and the warning (AC-25). Footer: "≈ N tokens · Injected as an untrusted block (## Project context) into every run." (AC-10). When `planBudget` over [own, inherited] with `ProjectContextList.budget_tokens` skips anything, show a warning naming the budget and the skipped docs, in a live region (AC-11).
    - Skills: react-best-practices, frontend-ui-architecture, typescript-expert, next-best-practices (files under `client/src/app/**`); tests: react-testing-library.
    - Depends on: step 12
    - Tests: existing `AgentEditor`/`SkillsTab` tests stay green (add the `context` and `agents` keys to any that render the editor, per the 2026-10-08 insight) · new `ContextTab.test.tsx`: total `≈ N tokens` includes inherited docs; over-budget warning names the budget and the skipped doc; inherited row shows "via {skill}" and has no checkbox; ticking saves immediately and the badge updates.
    - Done when: `npm_config_verify_deps_before_run=false pnpm --dir client exec vitest run "src/app/agents"` passes. Satisfies AC-7, AC-10, AC-11, AC-23, AC-24, AC-25.

14. Add the skill detail's Context tab.
    - Module: client
    - Files: create `client/src/app/skills/[id]/_components/SkillDetail/_components/ContextTab/{ContextTab.tsx,index.ts,styles.ts}` · create `…/ContextTab/ContextTab.test.tsx` · modify `client/src/app/skills/[id]/_components/SkillDetail/constants.ts` · modify `client/src/app/skills/[id]/_components/SkillDetail/SkillDetail.tsx` · modify `client/messages/en/skills.json`
    - Change: add `{ key: "context", labelKey: "context", icon: "FileText" }` to `TABS` after Preview (`VALID_TABS` derives from it) and render the tab for saved skills only (the `new` form keeps its single Config view). The tab shows "Project context to use", an "N attached" badge, the helper "Any agent using this skill inherits these documents.", the picker in `skill` variant, and a "Serializes as" box rendered from `serializePreview(attached)` showing `## Project context` and the path lines in order, never doc text (AC-13). Saves through `useSetSkillContext`.
    - Skills: react-best-practices, frontend-ui-architecture, typescript-expert, next-best-practices; tests: react-testing-library.
    - Depends on: step 12
    - Tests: existing `SkillDetail`/`ConfigTab` tests stay green (add message namespaces where needed) · new `ContextTab.test.tsx`: the "Serializes as" box lists the attached paths in order and contains no document text; ticking and reordering save immediately; the repo-less notice.
    - Done when: `npm_config_verify_deps_before_run=false pnpm --dir client exec vitest run "src/app/skills"` passes. Satisfies AC-7, AC-8, AC-13, AC-23, AC-24.

15. Add the read-only Project Context page and its sidebar entry.
    - Module: client
    - Files: create `client/src/app/repos/[repoId]/context/page.tsx` · create `client/src/app/repos/[repoId]/context/_components/ContextView/{ContextView.tsx,index.ts,helpers.ts,styles.ts}` · create `…/ContextView/ContextView.test.tsx` · modify `client/src/vendor/ui/nav.ts` · modify `client/messages/en/context.json`
    - Change: route `/repos/:repoId/context`, modelled on the `conventions` page. Sidebar: add `{ key: "context", label: "Project Context", icon: "FileText", href: "/repos/:repoId/context" }` to the WORKSPACE group (`activeKeyFor` already maps `/context` to `context`). The view uses `useProjectContextDocs`: header with the repo name and branch; a left list of docs with path, type badge (text) and `≈ N tokens`, filterable by path (AC-3); selecting a doc loads `useProjectContextDoc` and renders it with the `Markdown` primitive, plus "Used by N agents" (AC-4, AC-5); no control that edits, creates, uploads or deletes a file (AC-4). Empty state for `no_mirror` / `no_matches` names the reason and the globs in use (AC-6). Rescan button refetches and the footer reads "N files · ≈ T tokens total · scanned {relative time} ago" with T the sum of the listed docs' tokens (AC-26). When `total` exceeds the listed count show "Showing 1,000 of N docs — narrow the filter or the search roots" (AC-29). Paths and names render as plain text. If the `Markdown` primitive does not neutralise raw HTML or a `javascript:` link in the test below, fix it in `client/src/vendor/ui/primitives/Markdown.tsx` (react-markdown's default `urlTransform` is expected to).
    - Skills: react-best-practices, frontend-ui-architecture, typescript-expert, next-best-practices; tests: react-testing-library. `client/src/vendor/ui/nav.ts` and `client/messages/en/context.json`: none routed.
    - Depends on: step 11
    - Tests: new `ContextView.test.tsx`: lists docs and filters by path; selecting renders Markdown; there is no button or input whose name matches edit/new/upload/delete/save; a doc containing `<script>` and `[x](javascript:alert(1))` renders no script element and no `javascript:` href; `no_mirror` and `no_matches` states show the reason and the globs; the capped list shows the notice; Rescan refetches and updates the footer; "Used by N agents" shows the count.
    - Done when: `npm_config_verify_deps_before_run=false pnpm --dir client exec vitest run "src/app/repos"` passes. Satisfies AC-3, AC-4, AC-5, AC-6, AC-26, AC-29.

16. Show project context in the run trace drawer.
    - Module: client
    - Files: modify `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx` · modify `client/messages/en/runs.json` · create `…/TraceBody/TraceBody.test.tsx`
    - Change: the "Specs read" row renders from `trace.project_context` when present: one line per doc with its path as plain text, `≈ N tokens` and the status word verbatim (`included`, `missing`, `skipped_budget`) as text, plus the short commit; when `trace.config.source === 'ci'` it shows "Not used in CI runs" (AC-30); otherwise it falls back to the existing `specs_read` list (old traces) and "none". The Prompt assembly entry label `prompt.specs` becomes "Project context — attached specs (untrusted)"; the block already shows the exact stored text with copy and expand (AC-20). Status text and paths are never interpreted as markup. `RunTrace` is imported as a type.
    - Skills: react-best-practices, frontend-ui-architecture, typescript-expert, next-best-practices; tests: react-testing-library.
    - Depends on: step 2
    - Tests: new `TraceBody.test.tsx`: three docs with the three statuses are listed as text with tokens (AC-19); a path containing `<b>"x"</b>` renders as literal text; the Prompt assembly block shows the stored specs text (AC-20); `source: 'ci'` shows "Not used in CI runs"; a trace with only the legacy `specs_read` array still renders. Add the `runs` keys to existing drawer tests that need them.
    - Done when: `npm_config_verify_deps_before_run=false pnpm --dir client exec vitest run "RunTraceDrawer"` passes. Satisfies AC-19, AC-20, AC-30 (display).

17. Create the fixture mirror and wire it into the hermetic e2e script and the CI workflow.
    - Module: e2e (with `scripts/` and `.github/`)
    - Files: create `e2e/fixtures/payments-api-mirror/specs/public-api.md`, `…/specs/security-baseline.md`, `…/docs/onboarding-flow.md`, `…/docs/webhooks.md`, `…/docs/data-retention.md`, `…/insights/rate-limiting.md` · create `scripts/e2e-fixture-mirror.sh` · modify `scripts/e2e.sh` · modify `.github/workflows/e2e-web.yml`
    - Change: `scripts/e2e-fixture-mirror.sh <clone-dir>` copies the fixture tree into `<clone-dir>/acme/payments-api`, runs `git init`, commits, and leaves HEAD on `main`. `data-retention.md` is long enough to exceed the e2e budget by itself (at least 600 tokens); every other fixture doc is at most 120 tokens. `scripts/e2e.sh` creates a temp clone dir, runs the fixture script before the API starts, exports `DEVDIGEST_CLONE_DIR` and `PROJECT_CONTEXT_BUDGET_TOKENS=400` (so the over-budget path is reachable), and removes the temp dir in its existing teardown trap. The workflow sets the same two variables for the API step and runs the same script. Fixture files contain no instruction-like text.
    - Skills: security — `scripts/**` and `.github/workflows/**` route it. Fixture Markdown: none routed.
    - Depends on: steps 3, 8
    - Tests: none of their own; exercised by step 18.
    - Done when: `bash scripts/e2e-fixture-mirror.sh "$(mktemp -d)"` exits 0 and `git -C <dir>/acme/payments-api ls-tree -r --name-only HEAD` lists the six fixture files.

18. Add the deterministic e2e flows.
    - Module: e2e
    - Files: create `e2e/specs/10-project-context-page.flow.json` · create `e2e/specs/11-agent-context.flow.json` · create `e2e/specs/12-skill-context.flow.json` · create `e2e/specs/13-run-trace-context.flow.json`
    - Change: flows use only deterministic locators (`--url`, `--text`, `find role|text|label`), no LLM. `10`: open the seeded repo's Project Context page; the six fixture docs are listed with type badges and tokens; filter by path; select `specs/security-baseline.md` and see rendered text and "Used by"; no edit/new/upload control; Rescan updates the footer "N files · ≈ T tokens total · scanned" (AC-3, AC-4, AC-5, AC-26). `11`: open the seeded Security Reviewer's Context tab; tick `specs/public-api.md` and `specs/security-baseline.md`, badge shows "2 of 6 attached", keyboard-reorder them, reload and the order persists, `≈ N tokens` shows; tick `docs/data-retention.md` and the budget warning names `docs/data-retention.md` (AC-7, AC-8, AC-10, AC-11, AC-23, AC-27); untick all three at the end so the flow can run again. `12`: open a seeded skill's Context tab, attach a doc, "Serializes as" shows `## Project context` and the path, no doc text (AC-7, AC-13); detach at the end. `13`: open the seeded PR #482 run drawer for the Security Reviewer; "Specs read" lists `included`, `skipped_budget`, `missing` as text; expanding the Project context prompt entry shows the `<untrusted source="specs/security-baseline.md">` block (AC-19, AC-20). Keep the flows independent of each other and of the order of existing flows.
    - Skills: none routed (`e2e/**` routes only `project-rules`, a rule set the plan obeys: deterministic, no LLM, no network).
    - Depends on: steps 10, 13, 14, 15, 16, 17
    - Tests: the flows are the tests.
    - Done when: `npm --prefix e2e run typecheck` is clean and `npm --prefix e2e run e2e:hermetic` passes all flows, the four new ones included. AC-22 stays manual (see Verification).

## Contracts and data
Signatures and field shapes only (Zod, in both `server/src/vendor/shared/contracts/project-context.ts` and `client/src/vendor/shared/contracts/project-context.ts`):

- `MAX_ATTACHED_DOCS = 200`
- `ProjectContextDocType = z.enum(['specs', 'docs', 'insights'])`
- `ProjectContextDocStatus = z.enum(['included', 'missing', 'skipped_budget'])`
- `AttachmentPath = z.string().min(1).max(512)` refined as described in step 2
- `SetContextPathsInput = z.object({ paths: z.array(AttachmentPath).max(MAX_ATTACHED_DOCS) })`
- `ProjectContextDoc = { path: string; type: ProjectContextDocType; size: int; tokens: int; used_by: int }`
- `ProjectContextList = { repo_id: string; status: 'ok' | 'no_mirror' | 'no_matches'; globs: string[]; commit: string | null; scanned_at: string; total: int; budget_tokens: int; docs: ProjectContextDoc[] }`
- `ProjectContextDocContent = { path: string; type: ProjectContextDocType; size: int; tokens: int; content: string }`
- `ProjectContextTrace = { commit: string | null; docs: { path: string; tokens: int; status: ProjectContextDocStatus }[] }`
- `RunTrace.project_context: ProjectContextTrace.optional()`; `specs_read: string[]` is unchanged and holds the included paths
- `Agent.context_paths` and `Skill.context_paths`: `z.array(z.string()).default([])`
- `GitTreeEntry = { path: string; mode: string; blob: string; size: number }`; `GitClient.listTree(repo: RepoRef, ref: string): Promise<GitTreeEntry[]>`; `GitClient.readBlobs(repo: RepoRef, blobs: string[]): Promise<Map<string, Buffer | null>>`

Endpoints:
- `GET /repos/:id/context/docs` → `ProjectContextList`
- `GET /repos/:id/context/docs/content?path=<repo-relative>` → `ProjectContextDocContent`
- `PUT /agents/:id/context` with `SetContextPathsInput` → `Agent`
- `PUT /skills/:id/context` with `SetContextPathsInput` → `Skill`
- The never-served `/repos/:id/context` and `/repos/:id/context/reindex` calls are removed from the client (step 11).

Database: `agents.context_paths jsonb NOT NULL DEFAULT '[]'` and `skills.context_paths jsonb NOT NULL DEFAULT '[]'`, one generated migration (step 4). No new table. Attachments are paths only; doc text is stored only inside `run_traces.trace`.

Configuration: `PROJECT_CONTEXT_GLOBS` (`;`-separated, default `**/{specs,docs,insights}/**/*.md`), `PROJECT_CONTEXT_BUDGET_TOKENS` (default `20000`).

## Verification
- Modules to typecheck and test: reviewer-core, server, client (each with `npm_config_verify_deps_before_run=false pnpm --dir <module> run typecheck` and the test files named in each step; the full module suites once, after the last step of each package), e2e (`npm --prefix e2e run typecheck`).
- Extra checks:
  - Migration: `pnpm --dir server db:generate` produced exactly one new migration with the two `ADD COLUMN` statements and nothing else (step 4).
  - Server integration tests, which start a Postgres container and therefore need Docker: `server/test/project-context.it.test.ts`, `server/test/project-context-run.it.test.ts`, plus the existing `server/test/reviews.it.test.ts`, `server/test/agents-skills.it.test.ts`, `server/test/agents-versions.it.test.ts`, `server/test/skills.it.test.ts`. Do not run the other `*.it.test.ts` files.
  - Client production build `pnpm --dir client run build`: the new components import contract types, and a runtime import from `@devdigest/shared` only fails in the build (client insight 2026-09-25).
  - Contract copies: `diff server/src/vendor/shared/contracts/project-context.ts client/src/vendor/shared/contracts/project-context.ts` is empty.
  - Hermetic e2e `npm --prefix e2e run e2e:hermetic` (needs Docker and `agent-browser`): the plan adds flows, so it runs once after P4.
  - Manual, AC-22 (needs a provider key, so it is not automated): attach a doc stating "module api/ does not import db/ directly" to an agent, review a PR in which a file under `api/` imports from `db/`, and check that a finding's rationale names that doc's path.

## Open questions
- Does an agent with `enabled = false` count in "Used by N agents"? — assumed: yes; AC-5 names only the link-level and skill-level enable flags, so the count ignores the agent's own flag — affects step 7.
- Nothing in this tree creates `source = 'ci'` runs through the executor (the CI runner is a separate feature). — assumed: AC-30 is met by an optional `source` on the executor's jobs, proven by a direct executor test — affects step 10.
- AC-6 (empty state) and AC-12 ("Not found in <repo>") carry `Verify: e2e`, but the fixture mirror always exists in the hermetic stack and attached paths can only be made stale by editing the repo. — assumed: verified by integration (step 8) and component tests (steps 12, 15) instead — affects steps 12, 15.
- The engine repeats `## Project context` in every map-reduce chunk prompt (existing behaviour of the specs slot, as for skills). — assumed: acceptable; the budget counts docs once per run — affects step 10.
- The spec gives no maximum for the number of attached paths. — assumed: a technical sanity cap of 200 in the request schema, not a product limit — affects steps 2, 9.
- Tokenising up to 1,000 docs on the first, cold list may exceed the 2 s NFR; the blob-sha cache only helps later calls. — assumed: acceptable for a first call; step 5 measures read time, not tokenising — affects step 7.
- A doc that no longer matches the configured globs but is still attached keeps being read at run time (globs apply to listing only). — assumed: yes — affects steps 7, 10.
- Mirror existence is decided by whether the git calls succeed, not by `repos.clone_path` (the seeded repo has `clone_path = null` but the e2e fixture mirror exists on disk). — assumed: yes — affects steps 7, 17.
- Tab placement: Context goes after Skills in the agent editor and after Preview in the skill detail. — assumed: yes (the spec says "beside") — affects steps 13, 14.
- The glob separator `;` is the plan's choice because the default pattern contains a brace list with commas. — assumed: yes — affects step 3.

## For reviewers
- Architecture: dependency direction in the new `modules/project-context` (routes → service → repository; git and tokenizer only through the container); the executor reaches the service through `Container.projectContext`; `reviewer-core` receives only resolved `{ path, text }` values and gains no I/O.
- Architecture: the two `adapters.ts` copies and the two `project-context.ts` copies must agree; client code must import contract types only (`import type`).
- Security: no filesystem path is ever joined from user input — a path is readable only if it is an eligible entry of the `git ls-tree` result at one sha (symlink mode `120000`, `.git`, `node_modules` excluded). Check `readBlobs`: shas validated before they reach the child's stdin, fixed arguments, timeout.
- Security: untrusted rendering — prompt labels are escaped and each doc sits in its own `<untrusted>` block (`reviewer-core/src/prompt.ts`); the trace and the preview show paths and statuses as plain text; Markdown preview has no raw HTML and no `javascript:` links.
- Security: every new route calls `getContext()`, and every query that touches `repos`, `agents`, `skills` carries the workspace filter (`project-rules` rule 6); the attachment endpoints must not bump versions.
- Behaviour: `INJECTION_GUARD` changes for every prompt (one added sentence), and the run trace shape gains an optional field — check that old stored traces still parse and render.
