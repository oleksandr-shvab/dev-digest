# Blast Radius

A map of what else in the repository a pull request's changes can reach: the
symbols declared in the changed files, who imports or calls them, and the HTTP
endpoints and crons that may depend on that code. `repo-intel` already computed
it when it indexed the repository; this feature only **reads and shows** it — no
model call, no re-parse of the repository.

Source: the course homework "Домашнє завдання — Blast Radius" (screenshots, not
in the repo), transcribed here together with what was checked in this fork.
Facts and line numbers are from branch `A4-hw-blast-radius` at `bbdbf65`.
Nothing was run — see [Not verified](#not-verified).

```
repo-intel index → repoIntel.getBlastRadius → blast module (maps to BlastRadius)
                 → GET /pulls/:id/blast → UI block on Overview · MCP tool
```

## Hand-in

1. **Server**: module `server/src/modules/blast/` and route
   `GET /pulls/:id/blast`.
2. **UI**: a "Blast radius" block on the Overview tab of the pull request page.
3. **MCP**: `devdigest_get_blast_radius` in `mcp-server/`, replacing the lab's
   stub. The homework calls it `get_blast_radius`; every tool of this server
   carries the `devdigest_` prefix (BP-02 in
   [plans/mcp-server.md](../../plans/mcp-server.md)).
4. An open PR in the fork with a description of the implementation and a 1–3
   minute demo video that follows the [demo script](#demo-script).

Definition of done: every **P1** criterion is met and visible in the video.
**P2** and **P3** do not block; the mentor comments on them in the PR.

## Acceptance criteria

The homework lists these unnamed; the labels in the first column are this
file's own, so a plan or a verification report can cite them without counting.
`P1` / `P2` / `P3` are the homework's levels.

### P1 — blocks the hand-in

| Label | Criterion |
|---|---|
| `block` | The Overview tab of the pull request page has a **Blast radius** block. |
| `summary` | At the top of the block: how many symbols changed, how many callers they have, how many endpoints and crons are affected. |
| `callers-and-endpoints` | Under each changed symbol its callers are shown as `file:line`, and under them the endpoints that depend on that symbol. |
| `test-pr` | On the test PR (a change to a shared helper) the map shows at least two real callers — files that use the changed function, not its own dependencies — and at least one HTTP endpoint. |
| `github-link` | Clicking a `file:line` opens exactly that line on GitHub. |
| `empty-and-partial` | No callers: a clear text instead of an empty block. Incomplete index: a separate badge that states the reason. |
| `mcp-tool` | `devdigest-mcp` has a working blast radius tool instead of the lab's stub. Asked in Claude Code about the same PR it returns the same map as the block. It may be as simple as calling the route — the point is learning to add a tool to your own MCP server. |
| `pr-and-video` | An open PR in the fork with an implementation description and the demo video. |

### P2 — does not block; the mentor comments in the PR

| Label | Criterion |
|---|---|
| `no-reparse` | The logs of a request show the ready index being read, not the repository being parsed again: the AST and the import graph are not rebuilt. |
| `contract-validated` | The route response is validated against the `BlastRadius` contract. |
| `mapping-test` | The mapping from the flat `callers` list to the grouped `downstream` is covered by a unit test. |
| `no-llm` | The main scenario calls no LLM. An optional text summary, if built, is exactly one call, and the feature works without it. |
| `decl-file-excluded` | The file that declares a symbol never appears among that symbol's callers. |
| `limits-from-constants` | The limits (20 callers per symbol, traversal depth 2) come from `constants.ts`, not hard-coded in a component. |
| `degraded-reaches-ui` | `degraded` and `reason` from the facade reach the interface and are not lost on the server. |
| `mcp-lab-rules` | The tool follows the lab's rules: short description, when to call it, clear argument schema, terse response, a useful error for an unknown PR, `readOnlyHint: true`. |
| `subagents-named` | The PR description says which subagent did what. |

### P3 — wishes

| Label | Criterion |
|---|---|
| `collapsible-tree` | Symbols collapse and expand, like the tree in the design. |
| `graph-toggle` | A second view, a graph, with a Tree / Graph toggle (the keys `view.tree` and `view.graph` already exist). |
| `prior-prs` | A "Prior PRs touching these files" block: earlier PRs that changed the same files. The `PrHistory` schema exists in `brief.ts`; the starter has no data for it, so it has to be fetched from GitHub. |
| `crons-separate` | Crons are shown apart from HTTP endpoints. |
| `rank-order` | Symbols are sorted by `rank`, most important first. |
| `resync-button` | Next to the incomplete-index badge there is a button that calls `POST /repos/:id/resync`. |
| `labels-from-json` | UI labels are not hard-coded: the code uses a key (`stat.callers`, `noDownstream`) and the text comes from `client/messages/en/blast.json`, as `prReview.json` does on the Files changed tab. |

Only two things in the UI are mandatory: the summary line and the list under it
(changed symbol, its callers as `file:line`, endpoint chips).

### Reference design

The homework's screenshots (not in the repo), a card titled BLAST RADIUS. Top
row: four stats — symbols, callers, endpoints, cron — each an icon, a bold
number and a label, and a Tree / Graph toggle at the right end. **Tree**: one
row per changed symbol (chevron, name, "N callers" on the right); expanded, its
callers as `↳ path:line` in monospace, then chips under them — endpoints as
`METHOD /path` with a globe icon, crons with a clock icon in amber; another
symbol can be collapsed. A footer row "Prior PRs touching these files" with a
count. **Graph**: three columns joined by lines — changed symbols, caller
functions (by `name`), endpoints (truncated) — and a legend: changed symbol,
callers, endpoints affected. The summary row and the list are P1; the
collapsible tree, the toggle and the footer are P3.

## Starter state in this fork

What the homework calls "already in the starter", checked against the code.

| Homework says | This fork | Consequence |
|---|---|---|
| `repoIntel.getBlastRadius(repoId, changedFiles)` returns the whole map as `BlastResult`. | Exists with the described fields: [types.ts:57-87](../src/modules/repo-intel/types.ts#L57-L87), implementation [service.ts:220-391](../src/modules/repo-intel/service.ts#L220-L391). Reached as `container.repoIntel`; tests replace it through `ContainerOverrides.repoIntel` ([container.ts:112-115](../src/platform/container.ts#L112-L115)). | Use as is; one call per request. |
| The facade drops the declaring file, finds the caller's function name, pulls endpoints. | The fallback path (flag off, or no usable index) drops the declaring file ([service.ts:273](../src/modules/repo-intel/service.ts#L273)) but has no `factsByFile`, and it **scans the clone with ripgrep** instead of reading the index. The persistent path (flag on, index `full` or `partial`) returns `factsByFile` but has no declaring-file filter ([service.ts:342-371](../src/modules/repo-intel/service.ts#L342-L371)). | The mapper drops declaring-file callers itself (`decl-file-excluded`). `no-reparse` holds on the persistent path only. |
| 20 callers per symbol and depth 2 live in `constants.ts`. | `MAX_CALLERS_PER_SYMBOL = 20` and `BFS_DEPTH = 2` exist ([constants.ts:30,49](../src/modules/repo-intel/constants.ts#L30)). The 20 cuts the **whole** callers list, not each symbol ([service.ts:386](../src/modules/repo-intel/service.ts#L386)); blast does not use `BFS_DEPTH` (only [service.ts:661-686](../src/modules/repo-intel/service.ts#L661-L686) does). | A PR with many changed symbols can leave some of them without callers. Accepted — see Decisions. |
| With no data the facade returns empty arrays and `degraded: true` with one of five reasons. | Blast only ever returns `no_data` ([service.ts:228-234](../src/modules/repo-intel/service.ts#L228-L234), [297-303](../src/modules/repo-intel/service.ts#L297-L303)). For a `partial` index the persistent path returns `degraded: false` ([service.ts:338](../src/modules/repo-intel/service.ts#L338), [389](../src/modules/repo-intel/service.ts#L389)). | The incomplete-index badge cannot come from the facade alone — see Decisions. |
| The `BlastRadius` Zod schema is ready in `brief.ts`. | [brief.ts:43-70](../src/vendor/shared/contracts/brief.ts#L43-L70); the two vendored copies are identical (checked with `diff`). It has no `degraded` or `reason`. | The contract needs two optional fields in both copies — see Decisions. |
| `githubBlobUrl(repoFullName, sha, file, startLine)` builds the link. | [github-urls.ts:24](../../client/src/lib/github-urls.ts#L24) takes `(repoFullName, sha, file, startLine?, endLine?)`; its comment says `sha` pins the link to the PR's head. | Link SHA decided below. |
| The labels are in `blast.json`. | [blast.json](../../client/messages/en/blast.json) has `stat.symbols`, `stat.callers`, `stat.endpoints`, `stat.crons`, `view.tree`, `view.graph`, `callerCount`, `noDownstream`, `graph.empty`, `graph.ariaLabel`. Missing: block title, load error, the incomplete-index badge and its reasons, the resync button. | Add those keys. |
| Overview shows only the PR description. | [OverviewTab.tsx](../../client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx) renders `IntentCard` and the description; props `prBody`, `prId`. It is rendered at [page.tsx:137](../../client/src/app/repos/[repoId]/pulls/[number]/page.tsx#L137), where `repoId`, `repoFullName` and `pr.head_sha` are at hand. | The block goes in this tab; its props grow. |
| A `get_blast_radius` stub with description and schema is in `devdigest-mcp`. | [get-blast-radius.ts](../../mcp-server/src/tools/get-blast-radius.ts): `devdigest_get_blast_radius`, input `repository` + `pull_request_number`, `readOnlyHint: true`, always an error. Registered at [server.ts:34](../../mcp-server/src/server.ts#L34). | Replace the handler; keep the rest. |
| `GET /repos/:id/index-state` and `POST /repos/:id/resync` exist. | Both exist ([repo-intel/routes.ts:47-80](../src/modules/repo-intel/routes.ts#L47-L80)); the client has `useRepoIntelStatus` and `useResyncRepoIntel` ([hooks/repo-intel.ts:31,41](../../client/src/lib/hooks/repo-intel.ts#L31)). | Reuse for `resync-button`. |
| The route, the `blast/` module, the block and the client hook are missing. | Confirmed: no `server/src/modules/blast/`, no blast hook. | Build them. |
| Build through the L03 pipeline: planner → implementer → (architecture-reviewer ‖ plan-verifier). | The agents exist in `.claude/agents/`. `planner.md` and `implementer.md` name `server`, `client`, `reviewer-core` and `e2e` — not `mcp-server`; `pr-self-review/routing.json` does route `mcp-server/src/**`. | The plan lists the mcp-server checks under Verification → Extra checks. |

## Decisions

Taken while writing this spec because the homework text and the code disagree
or leave a choice open. Edit an entry to overturn it.

- **The facade stays as it is; the route tags a partial index.** `repo-intel` is
  not edited. The route also calls `repoIntel.getIndexState` and, when the
  facade answers `degraded: false` but the index status is `partial`, responds
  `degraded: true`, `reason: 'index_partial'`. Why: the homework says the feature
  shows data and does not recompute it, and the badge (`empty-and-partial`) needs
  the partial case the facade does not report. Alternative: fix the facade —
  two small edits in `service.ts` (partial → degraded; cap per symbol) and its
  tests, in a module this homework does not own.
- **`BlastRadius` gets two optional fields, in both vendored copies.**
  `degraded?: boolean` and `reason?:` one of `flag_off`, `index_failed`,
  `index_partial`, `repo_too_large`, `no_data` — the values of `DegradedReason`
  ([types.ts:27-32](../src/modules/repo-intel/types.ts#L27-L32)); a test or a
  type-level check keeps the two lists equal. Why: the route response
  (`contract-validated`), the block and the MCP tool then share one shape, and
  `PrBrief.blast` stays valid because the fields are optional. Alternative: a
  wrapper `{ blast, degraded, reason }` — the contract would no longer be "the
  same map" the MCP tool and the UI show.
- **The cap of 20 callers stays as the facade applies it** — over the whole
  list, in rank order. The PR description says so. Why: the facade stays as it
  is.
- **`downstream` has a group only for a symbol that has callers.** Grouping
  callers by `viaSymbol` yields no empty groups, which is the homework's
  mapping. A changed symbol without callers counts in `symbols` and stays in
  `changed_symbols`, but is not listed. Alternative: one group per changed
  symbol, empty ones included — noisy, because the facade reports every symbol
  of a changed file, exported or not.
- **Counting.** `symbols` = length of `changed_symbols`; `callers` = distinct
  (`file`, `name`) pairs across all groups; `endpoints` and `crons` = distinct
  strings across all groups. `summary` is the string
  `symbols: N, callers: N, endpoints: N, crons: N` (no model). The UI computes
  the same numbers from the structured data and takes its words from
  `blast.json`; it does not parse `summary`. Why: a caller that reaches two
  changed symbols, or an endpoint reached through two, counts once.
  Alternative: the sum of the lists as shown.
- **The link SHA is the PR head SHA** (`pr.head_sha`), through `githubBlobUrl` —
  the convention of the finding links. Why: caller files are outside the PR's
  diff, so they read the same at the head as at the base. Limit: line numbers
  come from the index (`lastIndexedSha`); if a caller file changed after that
  commit, or is itself changed by the PR, the line can drift. Alternative: pin
  to `lastIndexedSha` (needs the SHA in the response or a second request).
- **No LLM text summary.** `no-llm` allows one optional call; it is not built.
- **Placement.** The block goes under `IntentCard` and above the description.
  This fork's Overview is one column; the two-column grid of the design (PR
  brief, intent, risk areas) does not exist here and is not part of the task.
- **The MCP tool keeps `openWorldHint: false`** (owner). The sibling
  `devdigest_get_findings` uses `true` because its PR sync can reach GitHub, and
  this tool resolves a PR the same way; the owner chose to keep the stub's value.
- **P3 scope** (owner): `resync-button` and `collapsible-tree` are built with the
  P1 and P2 work. `graph-toggle` and `prior-prs` are not planned.

## Server — `GET /pulls/:id/blast`

Module `server/src/modules/blast/`: a `routes.ts` that default-exports a
Fastify plugin, added to [modules/index.ts](../src/modules/index.ts) with one
import and one entry (its header explains how). Same shape as
`GET /pulls/:id/smart-diff` ([reviews/routes.ts:143](../src/modules/reviews/routes.ts#L143)):
`IdParams` (uuid, otherwise 422), `getContext` for the workspace, a route
`response` schema, `NotFoundError` from `platform/errors`.

One request:

1. Look the PR up **scoped to the workspace**; unknown or foreign → 404
   `Pull request not found`. The facade is tenant-agnostic
   ([repo-intel/routes.ts:34-45](../src/modules/repo-intel/routes.ts#L34-L45)),
   so this check comes before it, and the repo id comes from the PR row, never
   from the request.
2. `changedFiles` = `path` of every `pr_files` row of the PR
   ([schema/pulls.ts:36](../src/db/schema/pulls.ts#L36)).
3. One call: `container.repoIntel.getBlastRadius(pull.repoId, changedFiles)`.
4. One call: `container.repoIntel.getIndexState(pull.repoId)` — only to tag a
   `partial` index.
5. Map to `BlastRadius` and answer 200. The route does not throw for a missing
   or degraded index; the facade does not throw either.

No LLM, no GitHub call, no index or resync job. Nothing in the route, the
mapper or a component repeats 20 or 2 (`limits-from-constants`); the UI does
not show the limits.

**Mapping** — a pure function with no I/O, so it is unit-testable without a
database (`mapping-test`):

| `BlastRadius` field | From |
|---|---|
| `changed_symbols` | `changedSymbols` unchanged (`name`, `file`, `kind`), facade order. |
| `downstream` | `callers` grouped by `viaSymbol`; groups in order of first appearance. The facade sorts callers by `rank`, highest first, so this is rank order (`rank-order`) without reading `rank`. |
| `downstream[].symbol` | `viaSymbol`. |
| `downstream[].callers` | `{ name: symbol, file, line }` per row, facade order. A row is dropped when its `file` is the declaring file of a changed symbol named `viaSymbol` (`decl-file-excluded`). |
| `downstream[].endpoints_affected`, `crons_affected` | Distinct values of `factsByFile[file].endpoints` / `.crons` over the group's caller files, first-seen order. Empty when `factsByFile` is absent: the fallback path cannot attribute endpoints to a symbol. |
| `summary` | `symbols: N, callers: N, endpoints: N, crons: N` (counting rules in Decisions). |
| `degraded`, `reason` | The facade's; a `partial` index → `true`, `index_partial`. |

**States** the route produces and the block shows:

| Situation | Response | Block |
|---|---|---|
| Index `full`, callers found | `degraded` false, groups filled. | The map. |
| Index `full` or `partial`, no callers (leaf or unexported symbols, or non-code files) | `downstream` empty; `changed_symbols` may be filled. | The `noDownstream` text with the symbol count. |
| Index `partial` | The data above plus `degraded: true`, `reason: 'index_partial'`. | The map plus the badge. |
| No index row (for example the seeded `acme/payments-api`), flag off, failed or degraded index | Whatever the facade's ripgrep fallback found, possibly nothing; `degraded: true`, `reason: 'no_data'`; endpoints empty. | The badge, and the data if any; the empty text if none. The `no_data` text must read right with and without data. |
| PR with no `pr_files` rows | Empty arrays, `degraded: true`, `reason: 'no_data'` (the facade's answer for no changed files). | The badge and the empty text. |

The state in the last row is rare: `GET /repos/:id/pulls` stores a PR's files in
`pr_files` while it syncs the list (the detail fetch of its diff-stat backfill,
at most 10 PRs per request; also when a PR's head sha moved or it has files but
no rows), so the blast route stays a pure read and never calls GitHub. It still
happens for a PR beyond that per-request cap, one whose detail fetch failed, a
repo synced only through `POST /repos/:id/poll` (which does not fetch details),
or when no GitHub token is configured.

**Log** (`no-reparse`): one `info` line per request through the request logger —
PR id, index `status`, number of changed files, symbols, callers, endpoints,
crons, `degraded`, `reason`, elapsed ms. Nothing in the request starts
indexing, so the log has no parse or graph-building lines.

**Tests**

- Unit, hermetic (`server/test/blast-*.test.ts`, no `.it.`): the mapper —
  grouping and order, duplicate rows, declaring-file drop, endpoint and cron
  attribution through `factsByFile`, no `factsByFile`, counts and `summary`,
  facade `degraded` passed through, `partial` upgrade, empty results.
- Contract: extend [contracts.test.ts](../test/contracts.test.ts) for the two
  optional fields and for the reason list matching `DegradedReason`.
- Integration (`*.it.test.ts`, needs Docker, self-skips without it): 200 and a
  valid `BlastRadius` for a seeded PR with a mocked `repoIntel`; 404 for an
  unknown id; 422 for a non-uuid.

## Client — the Blast radius block

On the Overview tab, under `IntentCard`.

- **Data**: a new React Query hook in `client/src/lib/hooks/` for
  `GET /pulls/:id/blast`, exported from the barrel `index.ts`. Types come with
  `import type` only from `@devdigest/shared`: a runtime import from the
  vendored barrel passes `tsc` and vitest but fails `pnpm build`
  ([client/insights.md](../../client/insights.md), 2026-09-25), so anything
  needed at runtime (the list of reasons) is mirrored locally.
- **Props**: `OverviewTab` also needs `repoId`, `repoFullName` and `headSha`;
  `page.tsx` already holds them and passes the last two to `FindingsTab`
  ([page.tsx:148-149](../../client/src/app/repos/[repoId]/pulls/[number]/page.tsx#L148-L149)).
- **States**:

  | State | Shows |
  |---|---|
  | loading | A `Skeleton`, as `IntentCard` does. |
  | request failed | A short error text from `blast.json`, as `IntentCard` does. |
  | data | The summary row and one group per `downstream` entry (see Reference design). |
  | `downstream` empty | The `noDownstream` text with the number of changed symbols. |
  | `degraded` | A badge with the text for `reason` — one label per each of the five reasons — and the map below it when there is data. |
  | `repoFullName` unknown | Callers as plain `path:line` text, no link. |

- **Links**: `githubBlobUrl(repoFullName, headSha, file, line)`, opened in a new
  tab (its header comment: "in a new tab"). Paths, symbol names and endpoint
  strings come from repository content and are rendered as text only.
- **Labels**: `useTranslations("blast")`; add the missing keys to `blast.json`.
  Add the `blast` namespace to the test provider in
  [render.tsx:22](../../client/src/test/render.tsx#L22): a missing namespace logs
  `MISSING_MESSAGE` when the hook is created, not when a key is read
  ([client/insights.md](../../client/insights.md), 2026-10-08).
- **P3**: the resync button next to the badge uses `useResyncRepoIntel(repoId)`
  and refreshes the block once the index state advances. The graph is built
  without a new dependency (see Out of scope). `prior-prs` needs a GitHub call
  that sits apart from the main route, so the map never depends on GitHub.
- **Tests**: component tests with `@/lib/api` mocked — data, no callers, the
  badge for each reason, the link `href`
  (`https://github.com/<repo>/blob/<sha>/<file>#L<line>`), loading, error.

## MCP — `devdigest_get_blast_radius`

Replace the stub's handler in
[get-blast-radius.ts](../../mcp-server/src/tools/get-blast-radius.ts). Keep the
tool name, its registration, the input schema (`repository` as `owner/name`,
`pull_request_number`) and the annotations `readOnlyHint: true`,
`openWorldHint: false`. The server still has exactly five tools (BP-04).

- **Flow**: `resolveRepository` → `deps.pulls.resolve(repo, pull_request_number)`
  → a new `DevDigestApi` method for `GET /pulls/:id/blast` → `toolResult`,
  inside `runTool`, so the handler never throws (BP-10).
- **Result**: `outputSchema`, `structuredContent` and the same JSON as text
  (BP-09). It carries `repository`, `pull_request_number`, and the route's
  `BlastRadius` fields **unchanged** — so the agent sees the same map as the
  block — plus `message`, one plain sentence when there are no callers or the
  data is degraded, saying what to do (for example, resync in DevDigest). No
  ids (BP-06). Names and paths go through `sanitizeText` (BP-14). The
  serialized size stays within `MAX_STRUCTURED_CHARS` (BP-08); if something is
  cut, `message` says so.
- **Description**: at most 400 characters (BP-03), says what it returns and when
  to call it, does not repeat the schema. Proposed: "Show what else in the
  repository a pull request's changes can affect: the changed symbols, who
  calls them (file:line) and the HTTP endpoints and crons that depend on them.
  Read-only, no model call. Call it before or while reviewing a PR. If the index
  is incomplete the result says so."
- **Errors** (BP-10): an unknown repository or PR is a `ToolInputError` from the
  resolvers, which already lists known repositories or PRs with an example;
  an unreachable API or a timeout goes through `describeApiError`; the route's
  404 gets the existing 404 text.
- **Texts that call it a stub and must change with it**:
  [README.md](../../mcp-server/README.md) (line 6, the table row at 81, section
  "5." at 302-310, line 619),
  [CLAUDE.md:5](../../mcp-server/CLAUDE.md), and
  [instructions.ts:5](../../mcp-server/src/instructions.ts) (the whole text
  stays within 2,048 characters, BP-01).
- **Check**: no tests in this module ([TESTING.md](../../TESTING.md)); typecheck,
  then call the tool from Claude Code for the test PR. The server is a
  long-lived child process, so restart it first (reconnect it with `/mcp`).

## Test PR

Any PR that changes an exported function that at least two other files import,
ideally with a caller file that registers an HTTP route. The homework suggests
a change in `server/src/modules/reviews/helpers.ts` or
`client/src/components/diff-viewer/helpers.ts`. Before the run
`GET /repos/<repoId>/index-state` must answer `status: "full"`; `repoId` is in
the PR page URL, `/repos/<repoId>/pulls/<number>`. A repository whose index is
`partial` or degraded is a working scenario too, shown separately.

As checked on 2026-10-21 in the local database (not durable):

- `oleksandr-shvab/dev-digest` — index `full`, 312 files, 21 of them with
  endpoints; 6 PRs. By title none is a shared-helper change: #1–#3 are
  one-file feature PRs (two summary endpoints and a review webhook), #4 and #5
  are the 252- and 72-file lab PRs, #6 is a test fixture. Their files were not
  inspected.
- `acme/payments-api` — the seeded PR #482 of the design, **no index row**:
  gives the `no_data` state, not a map.
- No repository has a `partial` index.

## Demo script

1. Open the test pull request → the Overview tab → the Blast radius block →
   show the summary on top: symbols, callers, endpoints, crons.
2. Under a changed symbol, show its callers as `file:line` and the endpoints
   under them.
3. Open one or two callers in the code and show that they are real files that
   use the changed function, not its own dependencies.
4. Click a `file:line` → that line opens on GitHub.
5. Show the state with no callers and the state with an incomplete index.
6. In Claude Code ask for the blast radius of the same PR → the answer matches
   the block on the page.
7. Say in one sentence why the map calls no model and parses nothing again —
   for example: the index was built once, when the repository was cloned, so
   the map is a read of ready data.

## Verification

Prefix every `pnpm` command with `npm_config_verify_deps_before_run=false`
(root [insights.md](../../insights.md), 2026-09-24).

| Module | Command |
|---|---|
| server | `pnpm --dir server typecheck`, `pnpm --dir server test` (the `*.it.test.ts` files need Docker and are reported as skipped without it) |
| client | `pnpm --dir client typecheck`, `pnpm --dir client test`, and `pnpm --dir client build` — the build is the only check that catches a runtime import from `@devdigest/shared` |
| mcp-server | `pnpm --dir mcp-server run typecheck` |

Then the manual run: the test PR in the browser, and the same PR from Claude
Code after restarting the MCP server.

## Constraints and out of scope

- `dev-digest/` at the repo root is an untracked nested clone of this repo
  ([insights.md](../../insights.md), 2026-09-21). Exclude it from every search;
  it is not a reference for this task unless the owner says so.
- Not touched: `repo-intel` (facade, index, constants), the rest of the design's
  page (PR brief, verdict, score, risk areas), any LLM call.
- No new dependency; the graph view (`graph-toggle`) is drawn by hand unless the
  owner approves a library. The implementer treats a new dependency as a
  blocker.
- No end-to-end browser flow unless the owner asks for one.

## Delivery

- Build it with the L03 pipeline: planner → implementer →
  (architecture-reviewer ‖ plan-verifier). The PR description says which
  subagent did what (`subagents-named`).
- Do not create `plans/blast-radius.md` by hand: the planner writes that file
  and does not overwrite an existing plan unless asked to revise it
  ([planner.md](../../.claude/agents/planner.md)).
- The plan carries the mcp-server step with the skills that `routing.json`
  assigns to `mcp-server/src/**`, and its typecheck under Extra checks (see
  Starter state). A change to the shared contract is one step that edits both
  vendored copies.
- `/pr-self-review` must pass before `gh pr create`; a hook blocks it otherwise
  (root [CLAUDE.md](../../CLAUDE.md)).

## Needs the owner

1. The test PR: choose an existing PR or open a new one on GitHub. A
   `gh pr create` from an agent session goes through the pre-PR hook.
2. Recording the video — an agent cannot record narrated screen video.
3. The incomplete-index demo needs an index row with `status` `partial`; none
   exists locally. Setting one is a write to the dev database.

## Not verified

- Nothing here was run: the API (:3001) and the web app (:3000) were down. The
  checks were code reads, a `diff` of the two contract copies and read-only
  `SELECT`s against the local Postgres.
- Whether the persistent path can return a caller from the declaring file itself
  (there is no explicit filter at [service.ts:342-371](../src/modules/repo-intel/service.ts#L342-L371)).
- Whether `extractEndpoints` recognises the route style of the caller files of
  the chosen test PR; the index shows 21 files with endpoints in the fork.
- Response time and size on a real 312-file index.
