# Development Plan: Local stdio MCP server for DevDigest (`mcp-server/`)

## Requirement

<details>
<summary>Original request (verbatim, as given to the planner)</summary>

Requirement: design a Development Plan (write it to plans/<slug>.md, e.g. plans/mcp-server.md) for a LOCAL-ONLY MCP server for DevDigest (local-first AI pull-request review; read /home/alexandr/Developer/dev-digest/CLAUDE.md and the touched modules' CLAUDE.md + insights.md first). Transport: stdio only for now (no Streamable HTTP, no auth). Written for the repo owner, who will read it in Ukrainian-speaking context but plan text may be English; they want a DETAILED explanation of what is implemented and how.

The server exposes exactly five tools:
1. list_agents — list all configured reviewers (agents) in DevDigest.
2. run_agent_on_pull_request — start a review of a given agent on a given pull request. Only tool with side effects (LLM cost/time). Review is NEVER auto-triggered; this is the explicit equivalent of POST /pulls/:id/review. Decide (and justify from the existing code) whether it is synchronous or returns a run id to be read via get_findings.
3. get_findings — findings of an already-completed agent run (filters, limit, pagination).
4. get_conventions — conventions of a repository.
5. get_blast_radius — STUB only; real implementation comes later. It must honestly report "not implemented" (consider isError: true and a description that says it is a stub) and must not return fake data.

Best practices already researched and to be reflected in the plan (cite each in the step that applies it):
- Token cost at chat start: Claude Code defers MCP tool definitions (tool search, on by default); only tool names and the server `instructions` field load at session start. So: write a concise `instructions` field (what tasks the tools handle, when to search for them, key capabilities; critical text first; Claude Code truncates each tool description and the instructions at 2,048 chars). Do NOT set alwaysLoad. Descriptive names with a shared prefix (e.g. devdigest_*) because tool search matches names/descriptions. Short descriptions, unambiguous parameter names (pull_request_id not id), no description text duplicating the schema. Few non-overlapping tools (five is fine). Server must start fast.
- Responses: return only high-signal fields (no raw UUID noise/low-level metadata); response_format concise|detailed where useful; pagination/filter/limit with sensible defaults (get_findings: severity filter, limit, cursor); truncation messages that tell the agent how to narrow the query; stay far below Claude Code's 10,000-token warning / 25,000-token cap (MAX_MCP_OUTPUT_TOKENS). Provide outputSchema + structuredContent, and also serialize JSON into a text content block for compatibility.
- Errors: tool execution errors go in the result with isError: true and an actionable message with a correct-input example, no stack traces; protocol errors only for unknown tool / invalid arguments.
- Annotations: readOnlyHint for list_agents, get_findings, get_conventions, get_blast_radius; run_agent_on_pull_request is not read-only and must not be hidden from confirmation.
- Schemas: Claude Code excludes tools whose input schema is invalid — property names 1–64 chars of ASCII letters/digits/_/./-, JSON Schema draft 2020-12, avoid root-level anyOf/oneOf/allOf. Validate inputs server-side.
- stdio: NEVER write anything to stdout except MCP messages; all logs to stderr (a stray console.log breaks the protocol). Validate all inputs, sanitize outputs.
- Evaluate on realistic tasks; track accuracy, number of calls, tokens, errors. Plan a way to measure the token cost of the tool list and of typical responses (e.g. count tokens of tools/list output).
Sources: Anthropic "Writing tools for agents", Claude Code MCP docs (tool search section), MCP spec 2025-06-18 (tools, transports).

IMPORTANT open point: the owner will send additional best-practice images later that are NOT available to you now. Leave a clearly marked section in the plan ("Owner's additional best practices — to be merged") and structure the plan so adding them is easy.

Things for you to decide from the code, or to ask me about (return clarifying questions instead of guessing where the code does not decide it): where the MCP server lives (new top-level folder with its own package.json per the repo convention vs inside server/), whether it calls the existing Fastify HTTP API over localhost or reuses server services/repositories directly (respect the onion-architecture and the rule that cross-package code goes through tsconfig path aliases, not published packages), what a "reviewer/agent" is in the existing schema, how a review run and its findings are stored, how "conventions" are stored per repository, how to identify a pull request/repo in tool arguments, which MCP SDK and Zod version to use (verify the current official TypeScript SDK API; ask before adding a dependency), how to register the server for Claude Code (.mcp.json at the repo root), tests (unit with the in-memory transport + a stdio smoke test), and docs/insights placement. Respect the "Do not touch" list. Include for every step: files, project skills the implementer must load, tests, Done-when, and the verification commands. Also list the out-of-scope items (HTTP transport, auth, real blast radius).

</details>

Owner's answers received after the first draft (2026-10-13 to 2026-10-16), applied throughout:

1. SDK = the official TypeScript SDK **v2** (`@modelcontextprotocol/server`; stable line since 2026-07-27, implements spec revision 2026-07-28). Not v1, not `@modelcontextprotocol/sdk`.
2. Approved dependencies: `@modelcontextprotocol/server`, `zod`, `tsx`. `js-tiktoken` is **not** approved.
3. Wire `mcp-server/` into the shared tooling (review-gate routing, local CI script, new workflow, insights routing) — step 2 stays.
4. PR lookup: per-process in-memory cache, no new server endpoint.
5. API responses are typed by a cast (as `client/src/lib/api.ts` does), not Zod-parsed.
6. Confirmed: data access is a thin wrapper over the existing DevDigest HTTP API, and the code lives in a new package `mcp-server/`.
7. `devdigest_run_agent_on_pull_request` is a **blocking** tool with a wait limit of **120 seconds** (configurable). Reaching the limit while the run is still going is not an error and does not cancel the run.
8. Package manager for `mcp-server/` = **pnpm** (like `server/` and `client/`), not npm.
9. "Skip tests for now": no test files, no vitest, no `@modelcontextprotocol/client` in this round. The test specs below stay in the plan, marked DEFERRED.

Goal: a new top-level package `mcp-server/` (`@devdigest/mcp-server`) runs as a local stdio MCP server that Claude Code starts from the repo's `.mcp.json`. It exposes five tools — `devdigest_list_agents`, `devdigest_run_agent_on_pull_request`, `devdigest_get_findings`, `devdigest_get_conventions`, `devdigest_get_blast_radius` (an honest stub) — and fulfils each one by calling the already-running DevDigest Fastify API on `http://localhost:3001`, never the database or server internals directly. The run tool starts one review and waits up to 120 s for it, returning a compact summary or, if the review is still running, the `run_id` to read later. Responses are small, paginated and schema-typed so that a Claude Code session pays only for the tool names and a short `instructions` text at start, and stays far below the 10,000-token output warning.

### Implementation round 1 scope

- **Round 1 (now):** steps 1–10 and 13, with production code only. That code includes everything the design needs: `clock.ts`, `runTool` and the error mapping, sanitizing, cursor paging and the size caps.
  - Every "Tests" bullet in steps 3–10 is marked **DEFERRED (owner: skip tests for now)**. Each step's Done-when uses checks that need no test runner: `pnpm run typecheck`, `grep` checks, and throwaway scripts that are not committed.
- **Round 2 (after the owner approves `@modelcontextprotocol/client` and the test tooling):** all deferred tests, step 11 (size measurement + size-budget test) and step 12 (evaluation kit).
- **Order and parallelism for the implementer:**
  - Step 1 comes first.
  - After step 1, step 2 (root tooling) is independent of steps 3–5 and may run in parallel with them.
  - Steps 3 → 4 → 5 → 6 are sequential.
  - After step 6, steps 7 and 8 are independent of each other. Both modify `src/server.ts`; they are parallel only if that one-line registration edit is merged by hand.
  - Step 9 needs steps 5–7; step 10 needs step 9; step 13 needs step 10.
  - Run independent steps in parallel **only where they touch disjoint files**.

## Out of scope

- Streamable HTTP (or SSE) transport — stdio only.
- Authentication or authorization in the MCP server. The local API itself has none either (`LocalNoAuthProvider`, `server/src/platform/container.ts:84`); the MCP process is trusted as the user's own process.
- A real blast-radius implementation. `devdigest_get_blast_radius` is a stub that always returns `isError: true` and no data.
- Any change to `server/`, `client/`, `reviewer-core/` or `e2e/` source, any shared Zod contract change, any DB schema change or migration, any new server endpoint (owner answer 4).
- Tools beyond the five: no cancel-run, no accept/dismiss finding, no "extract conventions" (that endpoint spends LLM tokens), no list-pull-requests, no "run all agents".
- Cancelling a review on the API when the wait limit is reached or when the MCP client aborts the call — the run keeps going on the API side.
- Long-polling / waiting inside `devdigest_get_findings` (only the run tool waits).
- MCP progress notifications during the run tool's wait (not needed: Claude Code's idle timeout for stdio tool calls defaults to 30 min), resources, prompts, sampling, elicitation, icons, `_meta` keys.
- Consuming the API's SSE stream `GET /runs/:id/events` (the wait polls instead; see the Decisions table).
- A tokenizer dependency (owner answer 2): sizes are reported in characters with a labelled chars/4 estimate (step 11, round 2).
- **Not in round 1:** every test file, vitest, `@modelcontextprotocol/client`, step 11 and step 12 (owner answer 9; see "Implementation round 1 scope").
- Building `mcp-server/` to `dist/` (it runs from source through `tsx`, like `server`'s `pnpm dev`).
- Merging the owner's not-yet-delivered best-practice images (a placeholder section is left; see Context).

## Context

### Decisions taken from the code, the owner's answers and the SDK docs

| Question | Decision | Evidence |
|---|---|---|
| Where does it live? | **Owner-confirmed.** Top-level folder `mcp-server/` with its own `package.json` + `pnpm-lock.yaml`, package `@devdigest/mcp-server`, `"type": "module"`. | Root `CLAUDE.md` "Stack": "each folder below has its own `package.json`/lockfile … cross-package code goes through tsconfig path aliases". `e2e/` is the precedent for a top-level package that is an out-of-process client of the running app. |
| What is already in `mcp-server/`? | The folder already exists and is **not empty**. Step 1 creates `package.json` fresh, installs over the leftover `node_modules`, and handles `pnpm-workspace.yaml` deliberately. | Found by the coordinator: (a) a **tracked** `mcp-server/pnpm-workspace.yaml` containing `allowBuilds:` / `  esbuild: set this to true or false` — pnpm's placeholder asking whether esbuild's build script may run (esbuild comes with `tsx`); (b) an **untracked, git-ignored** `mcp-server/node_modules` from an Oct 1 pnpm install of `@devdigest/mcp-server` 0.0.0 holding the **old v1** `@modelcontextprotocol/sdk` 1.30.0, zod 3.25.76, tsx 4.23.9, typescript 5.9.3, vitest 2.1.9 and @types/node; (c) **no** `package.json`, **no** lockfile. The old install state also shows the pnpm setting `minimumReleaseAge: 1440` (packages younger than one day are refused). |
| Package manager | **pnpm (owner answer 8)**, set up like `server/` and `client/`. | `server/` and `client/` both have `pnpm-lock.yaml`, an identical `.npmrc` (`node-linker=hoisted`, `auto-install-peers=true`, `strict-peer-dependencies=false`) and a `pnpm-workspace.yaml` that still holds the untouched `allowBuilds` placeholder (`server/pnpm-workspace.yaml`: cpu-features, esbuild, protobufjs, ssh2; `client/pnpm-workspace.yaml`: esbuild, sharp). `server/package.json` has no `packageManager` and no `engines` field, so this package adds neither. CI pins pnpm 10 through `pnpm/action-setup@v4` (`.github/workflows/client.yml`, `server-unit.yml`). |
| HTTP API over localhost, or reuse services in-process? | **Owner-confirmed.** A thin wrapper over the existing HTTP API on localhost. The MCP server imports nothing from `server/src` at runtime; it only does `import type` of the vendored Zod contracts. | (1) `ReviewService.runReview` starts the run fire-and-forget inside the process that received the call (`server/src/modules/reviews/service.ts:163-169`) and streams progress over the in-memory `runBus` (`server/src/platform/sse.ts`, singleton in `container.ts:85`). A run started inside the MCP process would be invisible to the web UI's live log and could not be cancelled from the UI (`cancelRun` signals only its own process's bus, `service.ts:102-110`). (2) The API reaps every `status='running'` row on boot, assuming "a SINGLE API instance per DB" (`server/src/app.ts:70-85`, `run.repo.ts:131-138`) — an API restart would mark MCP-owned in-flight runs failed while they still run. (3) Going through the routes keeps `getContext()` workspace scoping and Zod validation (`server/CLAUDE.md` Conventions, project-rules rule 6) for free. (4) Onion: the MCP server is a second delivery shell outside `server`'s rings, like the web client; it does not need a seam inside the server. |
| What is a "reviewer/agent"? | A row of `agents` (`server/src/db/schema/agents.ts`): name, description, provider, model, system prompt, strategy, `ci_fail_on`, `repo_intel`, `enabled`, `version`. Names are **not unique** (no unique index). API: `GET /agents` → `Agent[]` (`server/src/vendor/shared/contracts/knowledge.ts:322`). | |
| How are runs and findings stored? | One `agent_runs` row per agent per trigger (status `running → done/failed/cancelled`, `ran_at`, cost/tokens), grouped by `multi_agent_runs`; on success a `reviews` row with `run_id` + `findings` rows (`run-executor.ts:344-379`). API: `GET /pulls/:id/runs` → `RunSummary[]` newest first by `ran_at` (`run.repo.ts:40-69`), `GET /pulls/:id/reviews` → `ReviewRecord[]` with `run_id` and findings (`reviews/helpers.ts:55-74`). | `server/insights.md` 2026-09-15, 2026-09-17, 2026-09-25. |
| How are conventions stored? | `conventions` rows per repo with `status` pending/accepted/rejected, category, rule, evidence path/line/snippet, confidence. `GET /repos/:id/conventions` returns pending + accepted, confidence desc (`server/src/modules/conventions/repository.ts:28-41`). | |
| How to identify a repo / PR in tool arguments? | `repository` = `"owner/name"` (matched case-insensitively against `Repo.full_name` from `GET /repos`) and `pull_request_number` = the GitHub PR number. The MCP server resolves these to the API's UUIDs and caches PR ids per process (owner answer 4). No tool takes a PR or repo UUID; the only UUID an agent handles is `run_id`. | The web client also addresses PRs by number in its URL (`client/src/app/repos/[repoId]/pulls/[number]`) and resolves via `GET /repos/:id/pulls` (`client/src/lib/hooks/core.ts:101-117`). Anthropic "Writing tools for agents": prefer semantic identifiers over opaque ids. |
| Blocking or async run? | **Blocking with a bounded wait (owner decision).** `devdigest_run_agent_on_pull_request` sends the one `POST /pulls/:id/review`, then waits until the run reaches `done`/`failed`/`cancelled` or the wait limit (`DEVDIGEST_RUN_WAIT_MS`, default 120,000 ms) passes. `done` returns a compact summary; `failed`/`cancelled` returns `isError`; limit reached returns a normal `status: "running"` result with the `run_id` and the next step. The run is never cancelled by the MCP server. | `POST /pulls/:id/review` returns immediately and runs the work in a background `void` promise (`server/CLAUDE.md` Gotchas; `service.ts:145-169`), and run state is durable in `agent_runs`, so the client-side wait can be abandoned at any moment. |
| How does the run tool wait: poll or stream? | **Poll `GET /pulls/:id/runs` every 4 s** until the run's `status` is terminal. | The terminal status is authoritative in `agent_runs` (`run.repo.ts:183-218`), and that route reads it with one DB query and no GitHub call (`run.repo.ts:40-69`). The SSE route `GET /runs/:id/events` (`reviews/routes.ts:51-98`) streams from the in-memory `runBus`; consuming it would need a hand-written SSE parser and still a fallback for a dropped stream or an API restart. The web client also polls as its durable fallback: "a 4s poll of `/runs/active`" (`client/CLAUDE.md`). Load: at most 30 GETs per 120 s wait, against the API's global rate limit of 120 requests/min per client (`app.ts:93-97`), which the web UI's own 4 s poll (about 15/min) shares on localhost. |
| Double runs of the same agent on the same PR | The API does not prevent them: every `POST /pulls/:id/review` creates new `multi_agent_runs` + `agent_runs` rows (`service.ts:143-161`). **Default:** the run tool checks `GET /pulls/:id/runs` first; if a `running` run of the same agent on the same PR exists, it sends no POST and waits on that run instead (`started_new_run: false`). The description and the "still running" result also warn against calling the tool again. | Open question 8. |
| SDK | `@modelcontextprotocol/server` **2.3.1**, pinned exactly (owner answer 1). ESM, Node ≥ 20 (the package's `engines`). `McpServer` comes from the package root; stdio comes from `serveStdio` in the `/stdio` subpath (the root does not export stdio transports). `@modelcontextprotocol/client` (needed only for tests) is deferred with the tests (owner answer 9). | Coordinator-verified: `https://ts.sdk.modelcontextprotocol.io/v2/` and the published `.d.mts` files of `@modelcontextprotocol/server@2.3.1`. |
| Zod | `zod` `^4.2.0` (the v2 SDK packages depend on `zod ^4.2.0`; Zod 3 is not supported), imported as `import * as z from 'zod/v4'`, as in the SDK quickstart. Every other package in the repo — `server/`, `client/`, `reviewer-core/` — uses `zod ^3.24.1`. A different major per package is fine, because each has its own lockfile. | `server/package.json`, `client/package.json:27`, `reviewer-core/package.json`. |
| API response typing | Generic cast, as `client/src/lib/api.ts` does (owner answer 5). | |
| Registration for Claude Code | Project-scoped `.mcp.json` at the repo root, server key `devdigest`, `type: "stdio"`. The command is `mcp-server/node_modules/.bin/tsx` with args `["mcp-server/src/main.ts"]` — not `pnpm exec tsx …`. Reasons: `.npmrc`'s `node-linker=hoisted` (copied from server/client) gives a flat `node_modules` with `.bin/tsx`; it avoids pnpm's own start-up time on every session start (BP-05); and `pnpm exec` may run an implicit install (`verify-deps-before-run`, root insight 2026-09-24), whose output would land on stdout and corrupt the JSON-RPC stream (BP-13). | Open question 3 (working directory). |
| Tests | **DEFERRED to round 2 (owner answer 9).** The specs are kept below: unit tests through the client package's `InMemoryTransport` with a fake `fetch` and a fake clock; a stdio smoke test. Round 1 checks with `tsc`, `grep` and throwaway scripts that are not committed. | |
| Docs / insights | `mcp-server/CLAUDE.md`, `mcp-server/README.md` (the module docs, like `e2e/README.md`) and `mcp-server/insights.md` (seven fixed sections); rows added to root `CLAUDE.md`, `README.md`, `TESTING.md`, and the `engineering-insights` routing table. | Root `CLAUDE.md` "Module docs"; `.claude/skills/engineering-insights/entry-format.md`. |

### SDK v2 and Claude Code facts the plan relies on (verified by the coordinator)

- `new McpServer({ name, version }, options?)`; `options` includes `instructions?: string`, so `SERVER_INSTRUCTIONS` is passed as the second constructor argument.
- `serveStdio(factory: McpServerFactory, options?: ServeStdioOptions): StdioServerHandle` takes a factory that returns an `McpServer`, owns the transport and returns a handle with `close()`.
  - EOF on stdin tears the connection down and aborts in-flight requests. The docs show `process.on('SIGINT', () => handle.close())`.
  - A keep-alive handle (timer, socket pool) can keep the process alive after EOF; release it on `server.server.onclose`.
- `server.registerTool(name, { title?, description?, inputSchema?, outputSchema?, annotations?, icons?, _meta? }, cb)`.
  - `inputSchema`/`outputSchema` are `z.object({...})`. Raw shapes still work but are deprecated; never use them.
  - A tool without arguments omits `inputSchema`, and then its callback's only argument is the context object `ctx`. Otherwise the callback is `(args, ctx)`.
  - The request context carries an `AbortSignal` for requests the sender cancels. Its property name must be confirmed with `tsc` (it was seen as `signal: AbortSignal` in the 2.3.1 declarations).
  - Annotations never change how a tool runs.
- Schemas and results:
  - The SDK derives the JSON Schema for `tools/list` from the Zod objects.
  - It validates `structuredContent` against `outputSchema` before the result leaves the server, and skips that validation on any `isError` result.
  - The text content block is not derived: the handler writes `content: [{ type: 'text', text: JSON.stringify(output) }]` itself.
- Invalid arguments (failing `inputSchema`) come back as an ordinary tool result with `isError: true`, with text like "Input validation error: Invalid arguments for tool X: limit: Too big: expected number to be <=50". The handler does not run, and this is not a JSON-RPC protocol error.
- A handler that throws is caught too, and comes back as `isError: true` with the exception message as text. So handlers never throw (raw exception text would reach the agent); they return `isError` explicitly.
- Testing (round 2):
  - In process: `Client` and `InMemoryTransport` from `@modelcontextprotocol/client`. Both halves of `createLinkedPair()` must come from the same package. The docs say it "connects 2025-era instances only".
  - Subprocess: `StdioClientTransport` from `@modelcontextprotocol/client/stdio`.
- v1 APIs the plan must not use:
  - variadic `server.tool()`;
  - `setRequestHandler(Schema, …)`;
  - `McpError`/`ErrorCode` (now `ProtocolError`/`ProtocolErrorCode`);
  - `SSEServerTransport`;
  - any import from `@modelcontextprotocol/sdk/...`;
  - a handler second argument named `extra` (it is `ctx`).
- Claude Code:
  - `instructions` and each tool description are truncated at 2,048 characters by default.
  - Tools whose schemas have invalid property names, or are not draft 2020-12, are excluded. Root-level `anyOf/oneOf/allOf` are flattened.
  - `MAX_MCP_OUTPUT_TOKENS` defaults to 25,000, with a 10,000-token warning. `alwaysLoad` must not be set.
  - Connections use protocol revision 2026-07-28.
  - `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT` defaults to 30 min for stdio servers.
  - `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS` defaults to 120,000: a tool call still running after 2 min is moved to a background task (v2.1.212+; `0` disables). See Open question 9.

### Insights applied

- Insights applied: root `insights.md` — 2026-09-24 — pnpm 12 runs an implicit `pnpm install` before any script when it thinks `node_modules` is outdated (`verify-deps-before-run`), and this once failed with `ERR_PNPM_IGNORED_BUILDS` on esbuild. Effect here, now that `mcp-server/` uses pnpm:
  - Every `pnpm run …` command in this plan is prefixed with `npm_config_verify_deps_before_run=false`; `ci.mjs` already sets that for every module.
  - `.mcp.json` launches `tsx` directly, not through pnpm.
  - The esbuild `allowBuilds` placeholder is resolved deliberately in step 1.
- Insights applied: root `insights.md` — 2026-10-02 — `claude -p --output-format json` carries `num_turns` and `total_cost_usd`. Effect here: the deferred evaluation kit (step 12) uses it.
- Insights applied: root `insights.md` — 2026-09-21 — `dev-digest/` is an untracked nested clone. Effect here: the routing table's global `exclude` already drops it, and nothing under it is used as evidence.
- Insights applied: root `insights.md` — 2026-09-29 — the real Postgres container runs under the Docker `default` context. Effect here: the live checks say to run `docker --context default ps` before concluding the stack is down.
- Insights applied: `server/insights.md` — 2026-09-15 — `agent_runs` and `run_traces` are separate tables. Effect here: `devdigest_get_findings` and the run tool's wait read run status from `GET /pulls/:id/runs` and findings from `GET /pulls/:id/reviews` (joined on `run_id`), never from the trace.
- Insights applied: `server/insights.md` — 2026-09-17 — the seeded PR #482 review is linked to the seeded Security Reviewer run. Effect here: on the seeded DB, "latest completed run" for `acme/payments-api#482` resolves to a review.
- Insights applied: `server/insights.md` — 2026-09-25 — `agent_runs` has `ran_at`, no `created_at`. Effect here: "latest run" means first in `GET /pulls/:id/runs` order (newest `ran_at`).
- Insights applied: `server/insights.md` — 2026-09-15 — an empty `LOG_LEVEL=` breaks `EnvSchema.parse`. Effect here: `mcp-server`'s own env parsing treats an empty value as unset (step 3).
- Insights applied: `e2e/insights.md`, `reviewer-core/insights.md` — no entries. `client/insights.md` not loaded: no client file is touched.

### Constraints applied

- "each folder below has its own `package.json`/lockfile … cross-package code goes through tsconfig path aliases, not published npm packages" — root `CLAUDE.md`; project-rules rule 2 `published-internal-package`. Effect:
  - `mcp-server/tsconfig.json` aliases `@devdigest/shared` to `../server/src/vendor/shared`, like `reviewer-core/tsconfig.json:21-26`.
  - There is no `@devdigest/*` entry in `mcp-server/package.json`, and only `import type` from `@devdigest/shared`.
  - The vendored contracts are written for Zod 3, so the alias pins bare `zod` to Zod 4's bundled Zod 3 compatibility subpath (step 1, Open question 2).
- "Review is never auto-triggered … always an explicit `POST /pulls/:id/review`" — root `CLAUDE.md`; project-rules rule 1. Effect:
  - Only `devdigest_run_agent_on_pull_request` sends a POST, at most one per call.
  - The instructions and the description tell the agent to call it only on an explicit user request; the "still running" result tells it not to call again.
  - The double-run guard does not re-POST while the same agent's run is in progress.
  - `.mcp.json` and the docs never auto-approve it.
- "Every route goes through `getContext()` for workspace scoping" — `server/CLAUDE.md`; project-rules rule 6. Effect: the MCP server reaches data only through those routes.
- "`POST /pulls/:id/review` returns immediately" — `server/CLAUDE.md` Gotchas. Effect: the run tool waits by polling run status after the POST.
- "`GET /repos/:id/pulls` silently falls back to persisted data when GitHub/the token is unavailable" — `server/CLAUDE.md` Gotchas. Effect: PR resolution works offline; online it also syncs from GitHub, so resolved PR ids are cached per process (owner answer 4).
- Do not touch `server/src/db/migrations/*.sql` and the `devdigest_pgdata` volume — root `CLAUDE.md`. Effect: no schema change; the throwaway checks need no DB.
- onion-architecture "Composition Root Is the Only `new`" (applied by analogy outside `server/`). Effect:
  - Only `mcp-server/src/main.ts` constructs `DevDigestApi` and chooses the real clock.
  - The MCP server is built by one factory, `createDevDigestMcpServer`, which doubles as the `McpServerFactory` that `serveStdio` needs.
  - Tool handlers receive dependencies through `ToolDeps`.
- `security` is assigned only to steps that take tool input, make outbound requests, or emit LLM-written text (steps 3, 4, 5, 7, 8, 9).
- The routing table today has **no rule** for `mcp-server/**`; step 2 adds them (owner answer 3). Every `mcp-server/src/**` file's Skills below are "via the step 2 rules". The existing `zod-usage` rule matches only `from "zod"`, so step 2 adds a dedicated `zod/v4` content rule.

### Best-practice register (researched)

Each step cites these ids. Source abbreviations: **WT** = Anthropic "Writing tools for agents"; **CC** = Claude Code MCP docs (tool search section, env vars); **SPEC** = MCP specification (2025-06-18 as researched; the SDK and Claude Code now speak revision 2026-07-28); **SDK** = TypeScript SDK v2 docs.

| Id | Practice | Source | Applied in |
|---|---|---|---|
| BP-01 | Only tool names + server `instructions` load at session start (tool search defers definitions). Concise `instructions`: what tasks, when to search, key capabilities, critical text first; ≤ 2,048 chars. Do not set `alwaysLoad`. | CC | steps 6, 10, (11) |
| BP-02 | Descriptive tool names with a shared prefix `devdigest_`. | CC, WT | steps 6–9 |
| BP-03 | Short descriptions (≤ 2,048 chars hard, ≤ 400 target; the run tool ≤ 600), unambiguous parameter names (`pull_request_number`, not `id`), descriptions do not repeat the schema. | CC, WT | steps 5–10 |
| BP-04 | Few, non-overlapping tools — exactly five. | WT | step 10 check |
| BP-05 | Server starts fast: no network or DB call at startup; runs from source with `tsx` launched directly (not via pnpm). | CC | steps 1, 10 |
| BP-06 | High-signal responses: no PR/repo/finding UUIDs, no low-level metadata in `concise`; `response_format: concise|detailed`; the run tool returns counts and a capped top-findings list. | WT | steps 6–9 |
| BP-07 | Filters, `limit`, `cursor` with sensible defaults; truncation messages tell the agent how to narrow the query. | WT | steps 5, 7, 8, 9 |
| BP-08 | Stay far below the 10,000-token warning / 25,000-token cap; never set `MAX_MCP_OUTPUT_TOKENS`; size caps in code. | CC | steps 5, 9, (11) |
| BP-09 | `outputSchema` + `structuredContent`, plus the same JSON serialized by the handler into a text content block. | SPEC, SDK | steps 5–9 |
| BP-10 | Tool execution errors → `isError: true`, actionable message with a correct-input example, no stack traces; handlers never throw. With SDK v2, invalid arguments are also `isError` results (written by the SDK); only an unknown tool name can be a protocol error. | SPEC, WT, SDK | steps 4, 5, 6, 9 |
| BP-11 | Annotations: `readOnlyHint: true` on the four read tools; run tool not read-only, not destructive, not idempotent, never auto-approved. | SPEC, CC, SDK | steps 6–9, 13 |
| BP-12 | Valid input schemas: root `type: object`, no root `anyOf/oneOf/allOf`, property names `^[a-zA-Z0-9_.-]{1,64}$`, draft 2020-12; inputs validated by the SDK. | CC, SPEC, SDK | steps 5–10 |
| BP-13 | stdio hygiene: stdout carries only MCP JSON-RPC; every log goes to stderr. | SPEC, SDK | steps 1, 3, 10 |
| BP-14 | Validate all inputs, sanitize outputs (LLM-written finding text is untrusted). | SPEC | steps 3, 4, 5 |
| BP-15 | Evaluate on realistic tasks; track accuracy, number of calls, tokens, errors. | WT | step 12 (DEFERRED) |
| BP-16 | Measure the size of the tool list and of typical responses — characters + a labelled chars/4 estimate; optionally real `usage` from `claude -p`. | WT, CC | step 11 (DEFERRED) |
| BP-17 | Stub honesty: the stub says "stub" in its description, returns `isError: true`, never fake data. | requirement | step 6 |
| BP-18 | A blocking tool has a bounded, configurable wait that ends before the client gives up. Reaching the limit is a normal result with the handle and the next step, never an error and never a cancellation. The wait honours the client's abort signal. A 120 s wait needs no progress notifications, but it meets Claude Code's 120 s auto-background threshold. | owner, CC | steps 3, 5, 9, Verification |

### Owner's additional best practices — to be merged

**Placeholder.** The owner will send more best practices as images; they have not arrived yet. To merge them:

1. Add one row per practice below, with the next id `BP-O1`, `BP-O2`, …
2. In "Conflicts with", name any `BP-xx` row it contradicts. If it does, record both sides under Open questions instead of choosing silently.
3. For each step listed in "Steps affected", append the change to that step's `Change:`. If it is checkable, also add a clause to its `Done when:` and a test to its `Tests:`.
4. If it changes a tool's name, input, output or text, update "Contracts and data" (and "Final texts") first.

| Id | Practice (from owner's image) | Source | Conflicts with | Steps affected | Change to make | Check |
|---|---|---|---|---|---|---|
| BP-O1 | _to be filled_ | | | | | |

## Steps

All `pnpm` commands below run inside `mcp-server/` and are prefixed with `npm_config_verify_deps_before_run=false` (root insight 2026-09-24).

1. Set up the `mcp-server/` package over the existing leftovers, with pnpm, and write its module docs skeleton.
   - Module: mcp-server
   - Files:
     - create `mcp-server/package.json` · create `mcp-server/.npmrc` · create `mcp-server/tsconfig.json` · create `mcp-server/pnpm-lock.yaml` (generated by `pnpm install`, never hand-written) · create `mcp-server/CLAUDE.md` · create `mcp-server/insights.md`
     - modify-or-keep `mcp-server/pnpm-workspace.yaml` (tracked)
     - existing untracked `mcp-server/node_modules` (stale v1 install) is replaced by the install
     - DEFERRED to round 2: `mcp-server/vitest.config.ts`, `mcp-server/.gitignore` (`eval/runs/`)
   - Change:
     - Starting state: there is no `package.json` and no lockfile. A tracked `pnpm-workspace.yaml` holds the esbuild `allowBuilds` placeholder, and a stale `node_modules` contains `@modelcontextprotocol/sdk` 1.30.0, zod 3.25.76, tsx 4.23.9, typescript 5.9.3, vitest 2.1.9 and @types/node (Context table).
     - `package.json` (fresh):
       - `"name": "@devdigest/mcp-server"`, `"version": "0.1.0"`, `"private": true`, `"type": "module"` (the SDK is used as ESM).
       - description: "DevDigest MCP server (stdio) — exposes reviewers, review runs, findings and conventions to MCP clients by calling the local DevDigest API. No DB, no server imports."
       - No `packageManager` and no `engines` field, following `server/package.json`, which has neither. The SDK itself needs Node ≥ 20, and CI uses 22.
       - Scripts (round 1): `start` = `tsx src/main.ts`; `typecheck` = `tsc --noEmit -p tsconfig.json`. DEFERRED to round 2: `test` = `vitest run`, `measure:size` = `tsx scripts/measure-size.ts`, `eval:summarize` = `node eval/summarize.mjs`.
       - `dependencies`: `@modelcontextprotocol/server` `2.3.1` (exact), `zod` `^4.2.0`, `tsx` (the `^4.19.2` range used in `server/package.json`; a runtime dependency, because `.mcp.json` launches it).
       - `devDependencies`: `typescript` `^5.7.2`, `@types/node` `^22.10.0` (the ranges `server/package.json` uses).
       - Nothing else: no vitest, no `@modelcontextprotocol/client` (deferred with the tests), no `@devdigest/*` (project-rules rule 2).
     - `.npmrc`: copy `server/.npmrc` verbatim (`node-linker=hoisted`, `auto-install-peers=true`, `strict-peer-dependencies=false`). The hoisted layout is what makes `node_modules/.bin/tsx` usable from `.mcp.json` (step 10).
     - Install:
       1. Run `pnpm --version` and record it.
       2. Run `pnpm add @modelcontextprotocol/server@2.3.1 zod@^4.2.0 tsx@^4.19.2` and `pnpm add -D typescript@^5.7.2 @types/node@^22.10.0` (or write `package.json` first, then `pnpm install`).
       3. If pnpm refuses `@modelcontextprotocol/server@2.3.1` (or any package) because of `minimumReleaseAge`, **stop and report** — do not override the setting.
       4. After the install, `pnpm ls --depth 0` must show exactly the five packages above, and no `@modelcontextprotocol/sdk` and no `vitest`. If stale packages remain in `node_modules`, delete only `mcp-server/node_modules` (untracked, git-ignored, rebuilt by the install) and run `pnpm install` again.
     - `pnpm-workspace.yaml`, the `allowBuilds: esbuild` placeholder:
       - Precedent: `server/pnpm-workspace.yaml` and `client/pnpm-workspace.yaml` both keep the placeholder untouched, with no `onlyBuiltDependencies`, so by default keep `mcp-server/pnpm-workspace.yaml` unchanged.
       - If `pnpm install` cannot finish non-interactively with it — for example `ERR_PNPM_IGNORED_BUILDS` or a prompt — set `esbuild: false` when `pnpm exec tsx --version` and `node_modules/.bin/tsx src/main.ts` still work without esbuild's build script, and `esbuild: true` otherwise.
       - Report which choice was made and why.
     - `tsconfig.json`:
       - Copy `reviewer-core/tsconfig.json`'s `compilerOptions`: strict, `noUncheckedIndexedAccess`, `moduleResolution: "Bundler"`, `noEmit`, and the `@devdigest/shared` / `@devdigest/shared/*` aliases → `../server/src/vendor/shared/...`.
       - Add `"zod": ["./node_modules/zod/v3"]` (the vendored contracts import bare `zod`, written for Zod 3) and `"zod/*": ["./node_modules/zod/*"]` (so `zod/v4` resolves to Zod 4).
       - `"include": ["src/**/*.ts"]` in round 1; round 2 adds `test/**/*.ts` and `scripts/**/*.ts`.
       - If `tsc` cannot type-check `../server/src/vendor/shared` through this alias, stop and raise it (Open question 2).
     - `CLAUDE.md`: same shape as `e2e/CLAUDE.md`.
       - Title `# mcp-server — @devdigest/mcp-server`, plus one paragraph on what it is.
       - Commands: `pnpm install`, `pnpm run typecheck`, `pnpm start`; "tests: deferred (round 2)".
       - Map: filled in step 13.
       - Conventions:
         - "stdout is the JSON-RPC channel — never `console.log`, all logs via `src/log.ts` to stderr"
         - "talks only to the local API over HTTP; `@devdigest/shared` is `import type` only"
         - "Zod only as `import * as z from 'zod/v4'`, never bare `zod`"
         - "SDK v2 only: `@modelcontextprotocol/server`, `registerTool` with `z.object` schemas, never `@modelcontextprotocol/sdk` or `server.tool()`"
         - "every tool returns through `toolResult`/`toolError`; handlers never throw"
         - "only `devdigest_run_agent_on_pull_request` may send a POST, at most one per call; its wait never cancels the run"
         - "time only through the injected `Clock` (`src/clock.ts`)"
         - "pnpm, launched in `.mcp.json` via `node_modules/.bin/tsx`, never via `pnpm exec`"
       - Gotchas:
         - "the DevDigest API must be running (`./scripts/dev.sh`)"
         - "the first PR lookup per process triggers the API's GitHub sync in `GET /repos/:id/pulls`"
         - "invalid arguments never reach a handler — the SDK answers them with an `isError` result"
         - "Claude Code backgrounds tool calls after `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS` (default 120 s)"
         - "prefix pnpm scripts with `npm_config_verify_deps_before_run=false`"
       - Do not touch: "no runtime import from `../server`".
       - More: link `README.md` and `insights.md`.
     - `insights.md`: copy the header of `e2e/insights.md` (adjusted to `mcp-server/`), with the seven empty sections in the fixed order from `.claude/skills/engineering-insights/entry-format.md`.
   - Skills: none routed (manifests, config and docs match no rule); typescript-expert informally for `tsconfig.json` ("Respect existing baseUrl/paths configuration").
   - Depends on: none
   - Tests: none.
   - Done when:
     - `pnpm install` finishes non-interactively.
     - `pnpm ls --depth 0` prints `@modelcontextprotocol/server 2.3.1`, `zod 4.x`, `tsx`, `typescript` and `@types/node`, with no `@modelcontextprotocol/sdk` and no `vitest`.
     - `test -x node_modules/.bin/tsx` succeeds.
     - The pnpm version and the `pnpm-workspace.yaml` choice are reported.

2. Register `mcp-server/` with the pre-PR review gate, local CI, GitHub Actions and the insights routing.
   - Module: root (`.claude/`, `.github/`)
   - Files: modify `.claude/skills/pr-self-review/routing.json` · modify `.claude/skills/pr-self-review/routing.md` · modify `.claude/skills/pr-self-review/scripts/lib.mjs` · modify `.claude/skills/pr-self-review/scripts/ci.mjs` · modify `.claude/skills/engineering-insights/SKILL.md` · create `.github/workflows/mcp-server.yml`
   - Change:
     - `routing.json`:
       - Add rule `{ "id": "mcp-server", "match": ["mcp-server/src/**/*.ts", "mcp-server/scripts/**/*.ts"], "exclude": ["**/*.test.ts"], "skills": ["typescript-expert"] }` after `backend-layering`.
       - Add rule `{ "id": "mcp-server-zod", "match": ["mcp-server/src/**/*.ts"], "exclude": ["**/*.test.ts"], "content": "from [\"']zod/v4[\"']", "skills": ["zod"] }` after `zod-usage`.
       - Append `"mcp-server/src/**/*.ts"` to the `match` of `security-code`, and `"mcp-server/**"` to the `match` of `project-rules`.
       - Do not route `onion-architecture`.
     - `routing.md`: add a row `mcp-server/src/**/*.ts`, `mcp-server/scripts/**/*.ts` (not tests) → `typescript-expert` (+ `zod` when importing `zod/v4`, + `security` for `src`), with the reason "stdio MCP client of the local API, outside the server's onion rings". Add `mcp-server/` to the wording of the `security` and `project-rules` rows.
     - `lib.mjs`: add `"mcp-server"` to `MODULES` (line 88).
     - `ci.mjs`:
       - Add `"mcp-server": [["typecheck", "pnpm", ["typecheck"]]]` to `STEPS`, following the `server`/`client` entries.
       - **Round 1 has only the typecheck step.** Round 2 adds `["unit-tests", "pnpm", ["test"]]` together with the tests.
       - The install hint (line 96) already says `pnpm install` for every module that is not `e2e`/`reviewer-core`, so it needs no change.
       - Add `mcp-server` to the header comment's workflow list.
     - `mcp-server.yml`:
       - Copy the pnpm precedent `.github/workflows/client.yml` (one job, `pnpm/action-setup@v4` with `version: 10`, Node 22, `cache: pnpm`, `cache-dependency-path: mcp-server/pnpm-lock.yaml`, `pnpm install --frozen-lockfile`, `pnpm typecheck`), with `client` → `mcp-server`. Do not copy `reviewer-core.yml` (npm).
       - **No `pnpm test` step in round 1** (there are no tests).
       - Path filters: `mcp-server/**`, `server/src/vendor/shared/**` (type-only alias target), `.github/workflows/mcp-server.yml`.
       - Header comment: "stdio MCP server; typecheck only — tests deferred (round 2). Uses pnpm."
     - `engineering-insights/SKILL.md`: add routing row `` `mcp-server/**` `` → `` `mcp-server/insights.md` ``.
   - Skills: none routed for the `.claude/**` files; `.github/workflows/mcp-server.yml`: security (routed, not assigned — no secrets, `permissions: contents: read` as in the precedent) plus project-rules constraints.
   - Depends on: step 1 (parallel with steps 3–5: disjoint files)
   - Tests: the gate's own scripts are the check.
   - Done when:
     - `node .claude/skills/pr-self-review/scripts/collect-diff.mjs && node .claude/skills/pr-self-review/scripts/route.mjs` prints no `[route] warning:` line and lists `project-rules` with the `mcp-server/` files.
     - After step 3, the same command lists `typescript-expert`, `zod` and `security` with `mcp-server/src/config.ts`, and `node .claude/skills/pr-self-review/scripts/ci.mjs` prints `mcp-server:typecheck=pass` and no unit-tests entry.

3. Add env config (loopback-only API URL, run wait limit), the stderr logger and the stdout guard.
   - Module: mcp-server
   - Files: create `mcp-server/src/config.ts` · create `mcp-server/src/log.ts` · create `mcp-server/src/stdout-guard.ts` · DEFERRED (owner: skip tests for now): `mcp-server/test/config.test.ts`, `mcp-server/test/source-rules.test.ts`
   - Change:
     - `config.ts` (`import * as z from 'zod/v4'`) exports `interface McpConfig { apiBaseUrl: string; requestTimeoutMs: number; runWaitMs: number; logLevel: 'silent' | 'error' | 'info' | 'debug' }` and `loadMcpConfig(env: NodeJS.ProcessEnv = process.env): McpConfig`. A Zod schema `McpEnvSchema` reads:
       - `DEVDIGEST_API_URL`: default `http://localhost:3001`, matching the `API_PORT` default in `server/src/platform/config.ts:29`. It must be an `http:` URL with hostname `localhost`, `127.0.0.1` or `[::1]`, no credentials, path `/` only, and no query or hash. Otherwise it fails with "DEVDIGEST_API_URL must point at the local DevDigest API, e.g. http://localhost:3001". A trailing `/` is stripped.
       - `DEVDIGEST_MCP_TIMEOUT_MS`: per-HTTP-request timeout, coerced int 1,000–60,000, default 10,000.
       - `DEVDIGEST_RUN_WAIT_MS`: coerced int 5,000–600,000, default 120,000 (owner decision). Out of range fails with "DEVDIGEST_RUN_WAIT_MS must be between 5000 and 600000 (milliseconds); default 120000".
       - `DEVDIGEST_MCP_LOG`: enum above, default `info`.
       - An empty string counts as unset for every variable (`z.preprocess`, the pattern of `PROMPT_LOG_DETAIL` in `server/src/platform/config.ts:36-39`).
       - Use `safeParse`, and throw one `Error` listing every issue.
     - `log.ts` exports `interface Logger { error(msg: string, data?: Record<string, unknown>): void; info(...): void; debug(...): void }` and `createLogger(level): Logger`. Each call writes one JSON line `{ t, level, msg, ...data }` with `process.stderr.write` and never touches stdout (BP-13).
     - `stdout-guard.ts`: a side-effect-only module that reassigns `console.log`, `console.info` and `console.debug` to stderr, with the comment "stdout is the MCP JSON-RPC channel (stdio transport); a stray console.log from our code or a dependency would corrupt it". Only `main.ts` imports it, as its first import.
   - Skills: typescript-expert; zod (`config.ts`) — `parse-use-safeparse`, `error-custom-messages`, `compose-preprocess`, `schema-use-enums`, `schema-coercion-for-form-data`; security (`config.ts`) — the outbound target is fixed to loopback (local-only requirement). Via the step 2 rules.
   - Depends on: step 1
   - Tests — DEFERRED (owner: skip tests for now):
     - `mcp-server/test/config.test.ts`:
       - The URL defaults to `http://localhost:3001`; `runWaitMs` defaults to 120,000.
       - Accepted: `http://127.0.0.1:4001`.
       - Rejected: `https://example.com`, `http://192.168.1.5:3001`, `http://localhost:3001/api`, `http://user:pw@localhost:3001`.
       - `DEVDIGEST_RUN_WAIT_MS=110000` is accepted; `1000` and `900000` are rejected with the range message.
       - Empty values behave as unset.
       - An out-of-range request timeout is rejected.
     - `mcp-server/test/source-rules.test.ts` fails if `src/` contains:
       - `console.log(`, `console.info(`, `console.debug(` or `process.stdout`;
       - a bare-`zod` import;
       - `@modelcontextprotocol/sdk`;
       - `setTimeout(` or `Date.now(` outside `src/clock.ts`.
   - Done when:
     - `pnpm run typecheck` passes.
     - `grep -rnE "console\.(log|info|debug)\(|process\.stdout" src` prints nothing.
     - A throwaway one-liner, not committed (for example `pnpm exec tsx -e` importing `loadMcpConfig` with sample env objects), shows the default config and the rejection message for `http://192.168.1.5:3001`.

4. Add the typed HTTP client for the local API and repo/PR resolution.
   - Module: mcp-server
   - Files: create `mcp-server/src/api/client.ts` · create `mcp-server/src/api/resolve.ts` · DEFERRED (owner: skip tests for now): `mcp-server/test/fixtures.ts`, `mcp-server/test/api-client.test.ts`
   - Change:
     - `client.ts` exports `class DevDigestApiError extends Error { readonly status: number; readonly code: string | undefined }` (status `0` = unreachable; code `'timeout'` on timeout) and `class DevDigestApi`, with `constructor(opts: { baseUrl: string; timeoutMs: number; fetchImpl?: typeof fetch })` and these methods:
       - `listAgents(): Promise<Agent[]>` — `GET /agents`
       - `listRepos(): Promise<Repo[]>` — `GET /repos`
       - `listPulls(repoId: string): Promise<PrMeta[]>` — `GET /repos/:id/pulls`
       - `listRuns(pullRequestId: string): Promise<RunSummary[]>` — `GET /pulls/:id/runs`
       - `listReviews(pullRequestId: string): Promise<ReviewRecord[]>` — `GET /pulls/:id/reviews`
       - `listConventions(repoId: string): Promise<ConventionCandidate[]>` — `GET /repos/:id/conventions`
       - `startReview(pullRequestId: string, agentId: string): Promise<ReviewRunResponse>` — `POST /pulls/:id/review` `{ agentId }`
       There is no method for cancel or delete: the MCP server never cancels or deletes a run.
     - A private `request<T>(method, path, body?)` mirrors `client/src/lib/api.ts`:
       - `content-type: application/json` only when a body is sent.
       - The `ApiErrorBody` envelope → `DevDigestApiError`; a non-JSON error body is tolerated.
       - A fetch failure → status 0, "Cannot reach the DevDigest API at <baseUrl>".
       - `AbortSignal.timeout(timeoutMs)` → code `'timeout'`.
       - Every path segment goes through `encodeURIComponent`.
       - Types come via `import type` from `@devdigest/shared`, with a generic cast (owner answer 5).
     - `resolve.ts` exports:
       - `class ToolInputError extends Error`.
       - `resolveRepository(api, repository): Promise<Repo>`: a case-insensitive match on `full_name`. Not found → "Repository 'x/y' is not in DevDigest. Known repositories: <up to 10>. Example: {\"repository\": \"acme/payments-api\", \"pull_request_number\": 482}".
       - `class PullRequestResolver`, with `resolve(repo, pullRequestNumber): Promise<{ id: string; number: number; title: string }>`.
         - It caches in a `Map` keyed `${repo.id}#${number}` for the life of the process (owner answer 4), with a comment explaining why: the GitHub sync in `server/src/modules/pulls/routes.ts:42-113`, and stable ids (`routes.ts:66-74`).
         - Rows with a null `id` are skipped.
         - Not found → "Pull request #N was not found in x/y. Known PRs: #… (up to 10, newest first). Example: …".
   - Skills: typescript-expert; security — outbound requests go only to the validated loopback base URL, path segments are encoded, and only API-provided ids or schema-validated inputs reach a path. Via the step 2 rules.
   - Depends on: step 3
   - Tests — DEFERRED (owner: skip tests for now):
     - `mcp-server/test/fixtures.ts`:
       - seeded-shaped data: repo `acme/payments-api`, PR #482, the four seeded agents, a `done` Security Reviewer run with CRITICAL/WARNING/SUGGESTION/dismissed findings, a newer `running` run of another agent, two accepted and three pending conventions;
       - `createFakeFetch(routes)` with call recording and call-count-dependent routes;
       - `startFixtureApi()` on `127.0.0.1:0`.
     - `mcp-server/test/api-client.test.ts`:
       - GET happy path;
       - a 404 envelope → `DevDigestApiError`;
       - an unreachable API → status 0 with the base URL in the message;
       - a timeout → code `'timeout'`;
       - POST sends `content-type`, GET does not;
       - `resolveRepository` is case-insensitive and its not-found message lists the known repositories;
       - `PullRequestResolver` caches.
   - Done when:
     - `pnpm run typecheck` passes.
     - `grep -rnE "method: *'(DELETE|PUT|PATCH)'|/cancel" src/api` prints nothing.

5. Add the shared tool helpers: input fields, result/error builders, error mapping, output sanitizing, the injectable clock, and cursor paging with a size budget.
   - Module: mcp-server
   - Files: create `mcp-server/src/tools/shared.ts` · create `mcp-server/src/tools/paging.ts` · create `mcp-server/src/clock.ts` · DEFERRED (owner: skip tests for now): `mcp-server/test/shared.test.ts`, `mcp-server/test/paging.test.ts`
   - Change:
     - `clock.ts` exports `interface Clock { now(): number; sleep(ms: number, signal?: AbortSignal): Promise<void> }` and `systemClock: Clock`. `sleep` resolves early, without throwing, when the signal aborts. This is the only file that calls `setTimeout`/`Date.now`. DEFERRED to round 2: `createFakeClock()` for tests.
     - `shared.ts` (`import * as z from 'zod/v4'`) exports:
       - `interface ToolDeps { api: DevDigestApi; pulls: PullRequestResolver; logger: Logger; apiBaseUrl: string; clock: Clock; runWaitMs: number }`.
       - Zod fields, in Zod 4 forms (`z.int()`, `z.uuid()`):
         - `repositoryField`: trimmed, regex `^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$` with the message "Use owner/name, e.g. acme/payments-api", `.describe('GitHub repository as owner/name, e.g. acme/payments-api')`.
         - `pullRequestNumberField`: integer 1–10,000,000, `.describe('Pull request number as shown on GitHub, e.g. 482')`.
       - Size constants (BP-08): `MAX_STRUCTURED_CHARS = 12_000`, `ITEMS_BUDGET_CHARS = 10_000`, `RUN_TOP_FINDINGS = { maxItems: 5, maxChars: 2_000 }`, and `TEXT_CAPS = { title: 200, summaryConcise: 500, summaryDetailed: 1500, rationale: 600, suggestion: 400, rule: 300, snippet: 200, agentDescriptionConcise: 200, agentDescriptionDetailed: 1000, errorText: 300 }`.
       - `sanitizeText(value, maxChars): string | null`: strips ANSI escapes and C0/C1 control characters except `\n` and `\t`, trims, and truncates with the suffix ` …[truncated]` (BP-14).
       - `toolResult(structured)` → `{ structuredContent, content: [{ type: 'text', text: JSON.stringify(structured) }] }`, and `toolError(message)` → `{ isError: true, content: [{ type: 'text', text: message }] }`. The `CallToolResult` type name is to be confirmed with `tsc`.
       - `describeApiError(err, apiBaseUrl)`, mapping each case to a message:

         | Case | Message |
         |---|---|
         | status 0 | "The DevDigest API is not reachable at <url>. Ask the user to start it with ./scripts/dev.sh from the repo root, then retry." |
         | timeout | "The DevDigest API did not answer within <n> s. Retry once; if it keeps failing, check the API terminal." |
         | 404 | the server's message + "Check repository and pull_request_number." |
         | 429 | "DevDigest rate limit reached (review starts are limited to 10 per minute). Wait a minute, then retry." |
         | other 4xx | the server's message |
         | 5xx | "The DevDigest API failed (<status>): <message ≤ 300>. Check the API terminal for details." |

       - `runTool(name, deps, handler)`: catches everything, so a handler never throws into the SDK.
         - `ToolInputError` → its message.
         - `DevDigestApiError` → `describeApiError`.
         - Anything else → the stack goes to the stderr log, and the result is "Unexpected error in the DevDigest MCP server: <sanitized message ≤ 200>. Details are in the server log (stderr)."
         - Every call logs `{ tool, ms, is_error, chars }` at info.
     - `paging.ts` exports:
       - `encodeCursor(offset, key)` — base64url `{ o, k }`.
       - `decodeCursor(cursor, key)` — malformed → "This cursor is not valid. Repeat the call without cursor to start from the first page."; key mismatch → "This cursor belongs to a different query (filters changed). Repeat the call without cursor.".
       - `takePage(items, { offset, limit, maxChars, key })` → `{ page, nextCursor, stoppedByBudget }`, with always at least one item.
   - Skills: typescript-expert; zod (`shared.ts`) — `schema-string-validations`, `error-custom-messages`; security (`shared.ts`) — sanitizing AI-generated output, no stack traces or raw exception text in results, and the cursor treated as untrusted. Via the step 2 rules.
   - Depends on: step 4
   - Tests — DEFERRED (owner: skip tests for now):
     - `mcp-server/test/shared.test.ts`:
       - `sanitizeText` strips `\u001b[31m` and `\u0007`, keeps `\n`, and truncates.
       - `runTool` maps all three error kinds and never rejects.
       - No result text contains a stack line.
       - `describeApiError` for status 0 mentions the URL and `./scripts/dev.sh`.
       - The fake clock advances on `sleep`, and abort resolves `sleep` early.
     - `mcp-server/test/paging.test.ts`: first page and cursor, last page, budget stop with ≥ 1 item, key mismatch and malformed cursor.
   - Done when:
     - `pnpm run typecheck` passes.
     - `grep -rnE "setTimeout\(|Date\.now\(" src | grep -v "src/clock.ts"` prints nothing.

6. Create the MCP server factory with its `instructions`, and the first two tools: `devdigest_list_agents` and the `devdigest_get_blast_radius` stub.
   - Module: mcp-server
   - Files: create `mcp-server/src/instructions.ts` · create `mcp-server/src/server.ts` · create `mcp-server/src/tools/list-agents.ts` · create `mcp-server/src/tools/get-blast-radius.ts` · DEFERRED (owner: skip tests for now): `mcp-server/test/harness.ts`, `mcp-server/test/server.test.ts`, `mcp-server/test/tool-schemas.test.ts`
   - Change:
     - `instructions.ts` exports `SERVER_INSTRUCTIONS`, verbatim from "Final texts" (BP-01).
     - `server.ts` exports `SERVER_NAME = 'devdigest'`, `SERVER_VERSION = '0.1.0'` and `createDevDigestMcpServer(deps: { api; logger; apiBaseUrl; runWaitMs; clock }): McpServer`.
       - It builds one `PullRequestResolver`, then `new McpServer({ name, version }, { instructions: SERVER_INSTRUCTIONS })`, then one `register…(server, toolDeps)` per tool (steps 7–9 add theirs).
       - No I/O (BP-05). It is also the `serveStdio` factory in step 10.
     - Each tool file exports `register<Tool>(server, deps): void` and calls `server.registerTool(name, { title, description, inputSchema: z.object({...}), outputSchema: z.object({...}) (when it has one), annotations }, async (args, ctx) => runTool(...))`, with name, title and description verbatim from "Final texts" and schemas/annotations from "Tool contracts". Never raw shapes, never `server.tool()`. Only the run tool uses `ctx`.
     - `list-agents.ts`:
       - Calls `GET /agents`; sorts enabled first, then by name.
       - concise: `name, description (≤ 200), provider, model, enabled`. detailed adds `strategy, ci_fail_on, repo_intel, version`, and the description may be ≤ 1,000.
       - Never returns `id`, `system_prompt` or `output_schema` (BP-06).
       - An empty list → `message` "No reviewers are configured. Create one on the Agents page in DevDigest.".
       - Annotations: `readOnlyHint: true, openWorldHint: false`.
     - `get-blast-radius.ts`:
       - Takes `repository` + `pull_request_number`. It has no `outputSchema` and makes no API call.
       - It always returns `toolError` with the stub text from "Final texts" (BP-17).
       - Annotations: `readOnlyHint: true, openWorldHint: false`.
   - Skills: typescript-expert; zod (`list-agents.ts`, `get-blast-radius.ts`) — `schema-use-enums`, `refine-defaults`, `type-use-z-infer`. Via the step 2 rules.
   - Depends on: step 5
   - Tests — DEFERRED (owner: skip tests for now):
     - `mcp-server/test/harness.ts`: `connectTestClient` over `InMemoryTransport` from `@modelcontextprotocol/client`, with a fake fetch and a fake clock. Fallback: the stdio-subprocess harness if `createLinkedPair` does not connect.
     - `mcp-server/test/server.test.ts`:
       - instructions match and are ≤ 2,048 chars;
       - `list_agents` concise/detailed, with no ids, and text equal to `structuredContent`;
       - API down → `isError` mentioning the URL and `./scripts/dev.sh`;
       - the blast stub returns `isError`, makes no fetch, and its description starts with "STUB";
       - invalid arguments → SDK `isError` "Input validation error", no fetch;
       - unknown tool → the observed shape is recorded.
     - `mcp-server/test/tool-schemas.test.ts`, for every tool:
       - `devdigest_` prefix;
       - root `type: object`, with no root `anyOf/oneOf/allOf`;
       - property names match the regex;
       - `$schema` is 2020-12 or absent;
       - description ≤ 400 (run tool ≤ 600);
       - `outputSchema` has `type: object`.
   - Done when: `pnpm run typecheck` passes. The schema, description and instruction checks happen at runtime in step 10.

7. Add `devdigest_get_findings` and the shared findings view that the run tool reuses.
   - Module: mcp-server
   - Files: create `mcp-server/src/tools/findings-view.ts` · create `mcp-server/src/tools/get-findings.ts` · modify `mcp-server/src/server.ts` · DEFERRED (owner: skip tests for now): `mcp-server/test/get-findings.test.ts`, the `bigFindingsReview` fixture
   - Change (contract in "Tool contracts"):
     - `findings-view.ts` exports `SEVERITY_RANK`, `sortFindings` (severity desc, then `file`, then `start_line`), `countBySeverity` (non-dismissed only) and `toFindingItem(finding, format)`.
       - concise: `severity, category, title, file, start_line, end_line, confidence` (2 decimals), plus `triage` from `accepted_at`/`dismissed_at`.
       - detailed adds `kind`, `rationale ≤ 600` and `suggestion ≤ 400`.
       - All text goes through `sanitizeText`. No finding, review or PR ids.
     - `get-findings.ts` handler:
       1. Resolve the repo and PR.
       2. `api.listRuns(pr.id)`.
       3. Pick the run.
          - With `run_id`: that run, else "Run <id> is not a run of x/y#N. Omit run_id to read the latest completed run.".
          - Otherwise: the first `done` run, filtered by `agent_name` (case-insensitive) when given.
          - No match → "No completed review of x/y#N[ by <agent>] yet.[ <k> run(s) still running — call again in about a minute.] Start one with devdigest_run_agent_on_pull_request.". When the agent has no runs, also list the agent names that do have runs.
       4. A run that is not `done` (reachable only via `run_id`) returns a normal result with `findings: []` and a `message`:
          - running: "Review still running (started <ran_at>). Call devdigest_get_findings again in about a minute with the same run_id."
          - failed: "Run failed: <error ≤ 300>. Start a new run with devdigest_run_agent_on_pull_request once the cause is fixed."
          - cancelled: "Run was cancelled; no findings were stored."
       5. `api.listReviews(pr.id)` and take the review with `run_id === run.run_id && kind === 'review'`. Missing → "This run finished but stored no review."
       6. Filter by `min_severity` and dismissal, then `sortFindings`, then `toFindingItem`.
       7. `takePage` with key `f|<run_id>|<min_severity>|<include_dismissed>` and `ITEMS_BUDGET_CHARS`. Messages:
          - "Showing <returned> of <total> findings, most severe first. Pass cursor \"<next>\" for the next page, or narrow with min_severity: \"WARNING\"."
          - When the budget stopped it, add "Response size limit reached; use response_format \"concise\" or a smaller limit."
       8. The `run` block:
          - concise: `run_id, agent_name, status, ran_at, verdict, score, summary ≤ 500, error`;
          - detailed adds `provider, model, duration_ms, tokens_in, tokens_out, cost_usd, grounding`, with the summary ≤ 1,500;
          - an unknown status maps to `"unknown"`.
     - Annotations: `readOnlyHint: true, openWorldHint: true`.
   - Skills: typescript-expert; zod — `schema-string-validations` (`z.uuid()`), `refine-defaults`, `schema-avoid-optional-abuse`; security — agent input, sanitized and capped LLM text, untrusted cursor. Via the step 2 rules.
   - Depends on: step 6 (parallel with step 8 except for the `server.ts` registration line)
   - Tests — DEFERRED (owner: skip tests for now): `mcp-server/test/get-findings.test.ts`:
     - The default skips the newer running run.
     - `agent_name` is case-insensitive.
     - A running `run_id` → normal `running` result; a foreign `run_id` → `isError` "Omit run_id".
     - `min_severity` filter; dismissed findings are hidden by default and shown with the flag.
     - `limit: 1` returns a cursor that works; a reused cursor with different filters → `isError`; `limit: 500` → SDK `isError`.
     - Big detailed review → ≤ 12,000 chars plus a cursor message.
     - Concise output contains only the `run_id` UUID.
     - Unknown repo / PR / no runs → `isError` with guidance.
     - GET only.
   - Done when: `pnpm run typecheck` passes.

8. Add `devdigest_get_conventions`: a repository's conventions, accepted by default.
   - Module: mcp-server
   - Files: create `mcp-server/src/tools/get-conventions.ts` · modify `mcp-server/src/server.ts` · DEFERRED (owner: skip tests for now): `mcp-server/test/get-conventions.test.ts`
   - Change (contract in "Tool contracts"):
     - Calls `resolveRepository` only, so there is no GitHub sync; then `api.listConventions(repo.id)`.
     - Never calls `POST /repos/:id/conventions/extract`.
     - `CONVENTION_CATEGORIES = [...] as const satisfies readonly ConventionCategory[]`.
     - Filters by `status` (default `accepted`) and `category`. `counts` covers the whole repo. Paging key `c|<full_name>|<status>|<category or *>`.
     - Items: concise `category, rule ≤ 300, confidence, status`; detailed adds `evidence` "path:line", `evidence_snippet ≤ 200` and `edited`.
     - Messages (normal results):
       - "No accepted conventions for x/y yet; <n> pending candidates — pass status: \"pending\" to see them. Conventions are accepted on DevDigest's Conventions page."
       - "No conventions have been extracted for x/y yet. Run a scan on DevDigest's Conventions page."
       - the paging sentence with "narrow with category".
     - Annotations: `readOnlyHint: true, openWorldHint: false`.
   - Skills: typescript-expert; zod — `schema-use-enums`, `refine-defaults`; security — agent input, sanitized snippets. Via the step 2 rules.
   - Depends on: step 6 (parallel with step 7 except for the `server.ts` registration line)
   - Tests — DEFERRED (owner: skip tests for now): `mcp-server/test/get-conventions.test.ts`:
     - The default returns accepted only; `pending` returns 3; the `category` filter works.
     - The hint message appears when nothing is accepted.
     - detailed `evidence` is `path:line`.
     - Paging.
     - Only `GET /repos` and `GET /repos/<id>/conventions` are called.
   - Done when:
     - `pnpm run typecheck` passes.
     - `grep -n "extract" src/tools/get-conventions.ts` prints nothing.

9. Add `devdigest_run_agent_on_pull_request` — start one review and wait up to the limit for its result.
   - Module: mcp-server
   - Files: create `mcp-server/src/tools/wait-for-run.ts` · create `mcp-server/src/tools/run-agent-on-pull-request.ts` · modify `mcp-server/src/server.ts` · DEFERRED (owner: skip tests for now): `mcp-server/test/wait-for-run.test.ts`, `mcp-server/test/run-agent.test.ts`, the edits to `mcp-server/test/server.test.ts` and `mcp-server/test/fixtures.ts`
   - Change (contract in "Tool contracts"):
     - `wait-for-run.ts` exports `RUN_POLL_INTERVAL_MS = 4_000` (the web client's 4 s durable poll, `client/CLAUDE.md`) and `waitForRun(opts: { api; pullRequestId; runId; deadline; clock; signal? }): Promise<WaitOutcome>`.
       - `WaitOutcome` is `{ kind: 'terminal'; run } | { kind: 'deadline' } | { kind: 'aborted' } | { kind: 'missing' } | { kind: 'api_error'; error }`.
       - The loop:
         1. Aborted → `aborted`.
         2. `now ≥ deadline` → `deadline`.
         3. Otherwise `sleep(min(interval, deadline − now), signal)`, then `listRuns` and find the run.
         4. A terminal status → `terminal`; the run is absent → `missing`.
         5. Two consecutive API errors are tolerated; the third → `api_error`.
       - It never sends cancel or delete. An in-flight GET is not interrupted, so the answer may arrive up to one request timeout after the deadline.
     - `run-agent-on-pull-request.ts` handler (inside `runTool`, with `deadline = clock.now() + deps.runWaitMs`):
       1. Resolve the repo, the PR and the agent (`agent_name` is trimmed and matched case-insensitively). Two errors can stop it here, both before any POST:
          - no agent → "No reviewer named '<x>'. Available: <names>. Use a name from devdigest_list_agents.";
          - duplicate names → "<n> reviewers are named '<x>'. Rename one on DevDigest's Agents page, then retry.".
       2. Double-run guard (Open question 8): `listRuns(pr.id)`.
          - If a run of the same agent with `status === 'running'` exists, reuse its `run_id` with `started_new_run: false` and send no POST.
          - Otherwise `startReview` → `runs[0].run_id`, with `started_new_run: true`. If `runs[0]` is missing → "DevDigest accepted the request but returned no run.".
          - This is the server's only POST.
       3. `waitForRun` with the abort signal from `ctx` (confirm its property name with `tsc`).
       4. Map the outcome:

          | Outcome | Result |
          |---|---|
          | `done` | `listReviews`, then a normal result: `status: "done"`, `verdict`, `score`, `summary ≤ 300`, `finding_counts` (`countBySeverity`), `findings_total`, and `top_findings` (sorted, mapped to `{ severity, category, title ≤ 160, file, start_line, end_line }`, cut by `takePage` with `RUN_TOP_FINDINGS`). `next_step` is the done text from "Final texts". |
          | `failed` | `isError`: "The review failed (run <id>): <error ≤ 300>. Fix the cause (for example a missing provider API key in DevDigest Settings) and ask the user before starting it again." |
          | `cancelled` | `isError`: "The review was cancelled in DevDigest (run <id>). Ask the user before starting it again." |
          | `deadline` / `aborted` | a normal result: `status: "running"`, `elapsed_seconds`, `finding_counts: null`, `top_findings: []`, and `next_step` = the running text from "Final texts". No cancel request is sent. |
          | `missing` | `isError`: "Run <id> no longer exists in DevDigest (it was deleted). Ask the user before starting a new review." |
          | `api_error` | `isError`: `describeApiError` + " The review may still be running; check it later with devdigest_get_findings and run_id <id>." |

     - Annotations: `readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true`. No progress notifications.
   - Skills: typescript-expert — `WaitOutcome` is a discriminated union handled with an exhaustive `switch`; zod — `schema-string-validations`; security — the only state-changing request; inputs are validated and the agent resolved before it; at most one POST per call; project-rules rule 1. Via the step 2 rules.
   - Depends on: steps 5, 6, 7 (8 for the final `server.ts`)
   - Tests — DEFERRED (owner: skip tests for now). All use a fake fetch and the fake clock.
     - `mcp-server/test/wait-for-run.test.ts`:
       - terminal after 3 polls / 12,000 fake ms;
       - deadline after 30 polls, with no overshoot of `now`;
       - abort → no further GET;
       - two errors are tolerated, three → `api_error`;
       - `missing`;
       - only `GET /pulls/<id>/runs` is called.
     - `mcp-server/test/run-agent.test.ts`:
       - done within the limit: one POST with `{"agentId": …}`, plus counts;
       - failed and cancelled → `isError`;
       - deadline → `running` with "Do not call devdigest_run_agent_on_pull_request again", exactly one POST, and no DELETE or `/cancel`;
       - abort returns at once, with no cancel;
       - the double-run guard: no POST, `started_new_run: false`; another agent's running run does not block;
       - big review → `top_findings` ≤ 5 items and ≤ 2,000 chars, with the `get_findings` hint;
       - unknown or duplicate agent → no POST; 429 → "rate limit".
     - `mcp-server/test/server.test.ts` additions:
       - exactly five tools;
       - annotations as specified;
       - zero POSTs from the other four tools.
   - Done when:
     - `pnpm run typecheck` passes.
     - `grep -rn "startReview" src` shows exactly one call site, in `run-agent-on-pull-request.ts`.
     - The throwaway text check from step 10 (iii) passes for all five tools.

10. Add the stdio entrypoint and the Claude Code registration, and check them with throwaway scripts.
    - Module: mcp-server + root
    - Files: create `mcp-server/src/main.ts` · create `.mcp.json` · DEFERRED (owner: skip tests for now): `mcp-server/test/stdio-smoke.test.ts`
    - Change:
      - `main.ts`:
        1. Import `./stdout-guard.js` first.
        2. `loadMcpConfig()`. On error, write to stderr and `exit(1)`.
        3. `createLogger`, then `new DevDigestApi`.
        4. `const handle = serveStdio(() => createDevDigestMcpServer({ …, runWaitMs: config.runWaitMs, clock: systemClock }))`, from `@modelcontextprotocol/server/stdio`. Never build `StdioServerTransport` by hand.
        5. Log "devdigest MCP server ready" with the API URL and `runWaitMs` to stderr.
        6. `SIGINT`/`SIGTERM` → `handle.close()`; `unhandledRejection` → stderr.
        7. No API call at startup.
        - The only timer is the run tool's `sleep` during a call. EOF aborts that call's signal, which ends the sleep, so EOF ends the process.
      - `.mcp.json` (repo root): `{ "mcpServers": { "devdigest": { "type": "stdio", "command": "mcp-server/node_modules/.bin/tsx", "args": ["mcp-server/src/main.ts"], "env": { "DEVDIGEST_API_URL": "${DEVDIGEST_API_URL:-http://localhost:3001}", "DEVDIGEST_RUN_WAIT_MS": "${DEVDIGEST_RUN_WAIT_MS:-120000}" } } } }`.
        - It launches `tsx` directly, not with `pnpm exec`. The reasons are in the Context table: the hoisted layout, BP-05 start time, and BP-13 stdout safety.
        - No `alwaysLoad`, no `MAX_MCP_OUTPUT_TOKENS`.
    - Skills: `main.ts`: typescript-expert (via the step 2 rule); `.mcp.json`: none routed.
    - Depends on: step 9
    - Tests — DEFERRED (owner: skip tests for now): `mcp-server/test/stdio-smoke.test.ts` has two parts.
      - (a) Via `StdioClientTransport`: connect within 3,000 ms, see five tools, call `list_agents` against `startFixtureApi()`, and log the negotiated protocol revision. The run tool is not called.
      - (b) Raw spawn: zero stdout bytes outside the protocol, "ready" on stderr, and an exit within 5 s of stdin EOF.
    - Done when — three throwaway checks, **not committed** (write them in the session scratchpad, outside `mcp-server/`, and run them from the repo root so the `.mcp.json` command and args resolve as written):
      - (i) `pnpm run typecheck` passes.
      - (ii) A throwaway stdio check spawns `mcp-server/node_modules/.bin/tsx mcp-server/src/main.ts` from the repo root with `node:child_process`. There is no MCP client library in round 1, so it writes hand-written newline-delimited JSON-RPC: `initialize` with protocol version `2025-06-18`, then `notifications/initialized`, then `tools/list`. It checks that:
        - nothing appears on stdout before the `initialize` response;
        - every stdout line parses as a JSON-RPC 2.0 message;
        - `tools/list` returns exactly the five tool names;
        - every `inputSchema` has root `type: "object"`, no root `anyOf/oneOf/allOf`, and property names matching `^[a-zA-Z0-9_.-]{1,64}$` (record the `$schema` value it shows);
        - the process exits within 5 s once stdin is closed.
        Optionally, if the dev API is up, it also calls `tools/call devdigest_list_agents` and reports the result.
      - (iii) A throwaway text check compares `SERVER_INSTRUCTIONS` (from `src/instructions.ts`, or the `instructions` field of the `initialize` result) and each tool's `title`/`description` in the `tools/list` output, character for character, with "Final texts". It reports any difference.
      - The report must say honestly what was and was not verified. A pass shows only that the server answers a hand-written 2025-06-18 handshake. Claude Code's 2026-07-28 handshake and a real client were not available, so the live check in Verification remains needed. If the SDK rejects the 2025-06-18 `initialize`, report that and stop.

11. **DEFERRED to round 2 (owner: skip tests for now)** — add size measurement (characters + a labelled estimate, no tokenizer) and a size-budget test.
    - Module: mcp-server
    - Files: create `mcp-server/scripts/measure-size.ts` · create `mcp-server/test/size-budget.test.ts`
    - Change:
      - Both files use `estimateTokens(chars) = Math.ceil(chars / 4)`, commented as a rough estimate with no tokenizer dependency (owner decision).
      - `measure-size.ts` connects through `test/harness.ts` with fixture data and a fake clock, and prints a table with these columns: `Item | chars | est. tokens (chars/4, estimate) | % of 10,000-token warning (estimate)`. Rows:
        - session start: instructions + five tool names;
        - the full `tools/list` JSON;
        - each tool definition;
        - responses: `list_agents` concise/detailed; `get_findings` default and big detailed; `get_conventions` all detailed; the run tool's `done` (big review), `running` and `failed`; the blast stub; API down.
        - Each response is measured as text only and as text + `structuredContent`.
      - `size-budget.test.ts` asserts these limits:

        | Item | Limit (chars) |
        |---|---|
        | session start | ≤ 2,400 |
        | full `tools/list` | ≤ 12,000 |
        | each tool definition | ≤ 3,200 |
        | each response text | ≤ 20,000 |
        | text + structured | ≤ 40,000 |
        | run `done` text | ≤ 6,000 |

      - Optional manual real-token check: run `claude -p --output-format json "Reply with ok"` with and without `--mcp-config .mcp.json --strict-mcp-config`, and diff `usage` input tokens.
    - Skills: typescript-expert.
    - Depends on: step 10, plus the round-2 test tooling (`@modelcontextprotocol/client`, vitest)
    - Tests: `mcp-server/test/size-budget.test.ts`.
    - Done when: `pnpm run measure:size` prints the table inside the limits, with every token figure labelled as an estimate, and the size-budget test passes.

12. **DEFERRED to round 2 (owner: skip tests for now)** — add the evaluation kit: realistic tasks, a headless procedure and a transcript summariser.
    - Module: mcp-server
    - Files: create `mcp-server/eval/tasks.md` · create `mcp-server/eval/summarize.mjs` · create `mcp-server/eval/results.md` · create `mcp-server/.gitignore` (`eval/runs/`)
    - Change:
      - `tasks.md` (BP-15):

        | Task | Prompt | Expected calls | Passes when |
        |---|---|---|---|
        | E1 | "Which reviewers are configured in DevDigest?" | `list_agents` ×1 | all four names are listed |
        | E2 | "What critical issues did the Security Reviewer find on PR 482 of acme/payments-api?" | `get_findings` with `agent_name`, `min_severity: "CRITICAL"` ×1 | the seeded CRITICAL finding appears with file:line |
        | E3 | "What coding conventions does acme/payments-api follow?" | `get_conventions` ≤ 2 | the answer says they are unconfirmed candidates |
        | E4 (opt-in: LLM cost, blocks up to `DEVDIGEST_RUN_WAIT_MS`, never in default or CI runs) | "Run the Security Reviewer on acme/payments-api#482 and summarise the critical findings." | `run_agent_on_pull_request` ×1, plus `get_findings` only after a `running` result (≤ 4 calls) | exactly one run-tool call; record elapsed time, status and whether Claude Code backgrounded the call |
        | E5 | "What is the blast radius of acme/payments-api#482?" | `get_blast_radius` ×1 | not available, nothing invented |
        | E6 | "Show findings for acme/unknown-repo PR 1." | 1 call, `isError` | the answer names the known repository |

      - Procedure:
        1. Start the stack with `./scripts/dev.sh`. Check `docker --context default ps` first, and that there is no empty `LOG_LEVEL=` in `server/.env`.
        2. Run `claude -p --mcp-config .mcp.json --strict-mcp-config --allowedTools "<read tools, mcp__devdigest__ prefix>" --output-format stream-json --verbose "<prompt>" > mcp-server/eval/runs/<id>.jsonl`.
        3. For E4 only, also allow the run tool. Never put the run tool into `.claude/settings.json`.
      - `summarize.mjs` (Node, no dependencies) prints per task:
        - devdigest calls, and run-tool calls;
        - `is_error` results;
        - `num_turns`;
        - `usage` tokens;
        - `total_cost_usd`;
        - result sizes.
        An empty `runs/` prints "no runs".
      - `results.md`: a table template with run-wait and "backgrounded?" columns.
    - Skills: none routed.
    - Depends on: step 10
    - Tests: none (manual).
    - Done when: `pnpm run eval:summarize` prints "no runs"; after E1, one row.

13. Write the module README (the detailed explanation) and register the module in the repo docs.
    - Module: mcp-server + root docs
    - Files: create `mcp-server/README.md` · modify `mcp-server/CLAUDE.md` · modify `CLAUDE.md` · modify `README.md` · modify `TESTING.md`
    - Change:
      - `mcp-server/README.md` sections:
        - What it is and why: stdio, local-only, SDK v2 2.3.1, Zod 4 (the rest of the repo is on Zod 3), pnpm.
        - Architecture: a mermaid flowchart, plus why reviews do not run in-process.
        - The five tools: purpose, inputs, outputs, an example call and result each.
        - How the run tool waits: the 4 s poll, the 120 s limit, the `running` result, the double-run guard, never cancelling.
        - Claude Code timeouts: idle 30 min, auto-background at 120 s, `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS` / `DEVDIGEST_RUN_WAIT_MS`.
        - Error model and message catalogue.
        - Size budget: the caps in code; "measurement deferred (step 11, round 2)".
        - Security notes.
        - Running and registering:
          - `cd mcp-server && pnpm install`;
          - `pnpm run typecheck`;
          - `.mcp.json`, approving the project server;
          - `claude mcp list`.
          Only commands that exist in round 1.
        - Testing: "tests deferred (round 2); round 1 was checked with `tsc` and throwaway stdio/text checks".
        - Evaluation: "evaluation kit deferred (round 2)".
        - Troubleshooting: API down, the stdout rule, the Docker `default` context, pnpm `verify-deps-before-run`.
        - Adding a tool: a checklist.
        - Owner's additional best practices: a pointer to this plan.
      - `mcp-server/CLAUDE.md`: fill in the Map with the final files.
      - Root `CLAUDE.md`:
        - Map row: `` `mcp-server/` | `@devdigest/mcp-server` | Local stdio MCP server — DevDigest tools for Claude Code over the local API ``.
        - Module docs line: `` [`mcp-server/CLAUDE.md`] · [`mcp-server/README.md`] (already the mcp-server docs) · [`mcp-server/insights.md`] ``.
      - Root `README.md`:
        - a package table row (port "—");
        - `mcp-server` added to the per-package README links;
        - a CI table row `mcp-server (stdio MCP, typecheck only) | mcp-server.yml | no`.
      - `TESTING.md`: a row next to `reviewer-core` saying "typecheck only; tests deferred (round 2)".
    - Skills: none routed (docs).
    - Depends on: step 10
    - Tests: none.
    - Done when: every path linked from the new README and the edited rows exists; `grep -n "mcp-server" CLAUDE.md README.md TESTING.md` shows the new rows.

## Contracts and data

### Architecture overview (how it works)

- **Process model.**
  - Claude Code reads `.mcp.json` and spawns `mcp-server/node_modules/.bin/tsx mcp-server/src/main.ts`.
  - It talks to the child over stdin/stdout with newline-delimited JSON-RPC.
  - `serveStdio` (SDK v2) owns the transport and builds the `McpServer` through our factory.
  - Logs go to stderr only. EOF on stdin ends the process.
- **Layers inside `mcp-server/src`.**
  - `main.ts` — the composition root.
  - `server.ts` + `instructions.ts` — the factory.
  - `tools/*.ts` — one file per tool, plus `shared.ts`, `paging.ts`, `findings-view.ts` and `wait-for-run.ts`.
  - `api/client.ts` — the only HTTP, loopback only. `api/resolve.ts` maps `owner/name` + PR number to ids.
  - `clock.ts` — the only source of time.
- **Validation path.** The SDK validates arguments against `inputSchema` before the handler runs; failures come back as `isError` "Input validation error: …". It validates `structuredContent` against `outputSchema` on the way out, except for `isError` results.
- **Data path per tool.**

| Tool | API calls (in order) | Side effects |
|---|---|---|
| `devdigest_list_agents` | `GET /agents` | none |
| `devdigest_get_findings` | `GET /repos` → `GET /repos/:id/pulls` (first time per PR) → `GET /pulls/:id/runs` → `GET /pulls/:id/reviews` | the API's GitHub PR sync inside `GET /repos/:id/pulls` |
| `devdigest_get_conventions` | `GET /repos` → `GET /repos/:id/conventions` | none |
| `devdigest_run_agent_on_pull_request` | `GET /repos` → `GET /repos/:id/pulls` (cached) → `GET /agents` → `GET /pulls/:id/runs` (guard) → `POST /pulls/:id/review` (only if that agent has no running run) → `GET /pulls/:id/runs` every 4 s (≤ 30 at 120 s) → `GET /pulls/:id/reviews` (when `done`) | creates `multi_agent_runs` + `agent_runs` rows; LLM cost; the MCP server never cancels the run |
| `devdigest_get_blast_radius` | none | none |

- **Run lifecycle seen from the agent.**
  1. The run tool blocks for up to 120 s.
  2. Usually it returns `done` with the verdict, counts and top findings; `devdigest_get_findings` gives the full list.
  3. If the review is slower, it returns `running` with the `run_id`. The review continues on the API, and the agent reads the result later with `devdigest_get_findings` — it must not re-run the review.
  4. The web UI shows the same run live.

### No changes to

- DB schema, migrations, server routes, shared Zod contracts. Types via `import type` from `@devdigest/shared`: `Agent`, `Repo`, `PrMeta`, `RunSummary`, `ReviewRecord`, `FindingRecord`, `ConventionCandidate`, `ConventionCategory`, `Severity`, `ReviewRunResponse`, `ApiErrorBody`.

### Final texts (verbatim — `src/instructions.ts` and every registered title/description must match character for character; step 10 (iii) checks this)

**`SERVER_INSTRUCTIONS`** (passed as `new McpServer(info, { instructions })`):

```text
DevDigest is the user's local AI pull-request review studio. These tools read and run DevDigest reviews through its local API. Search for "devdigest" when the user asks about DevDigest reviewers (agents), review findings on a pull request, a repository's coding conventions, or wants a DevDigest review run.
- Identify a pull request by repository ("owner/name") and pull_request_number.
- devdigest_run_agent_on_pull_request is the only tool with side effects: it spends LLM tokens. Call it only when the user explicitly asks for a review. It waits up to about 2 minutes and returns the verdict and top findings. If it returns status "running", the review is still going on the server: do not call it again (that pays for a second review) — call devdigest_get_findings with the returned run_id a minute later.
- Read-only: devdigest_list_agents, devdigest_get_findings (latest completed run by default; filter by severity, page with cursor), devdigest_get_conventions.
- devdigest_get_blast_radius is a stub and returns no data yet.
If a tool reports that the DevDigest API is unreachable, ask the user to start it with ./scripts/dev.sh.
```

**Tool titles and descriptions:**

| Tool | Title | Description |
|---|---|---|
| `devdigest_list_agents` | List DevDigest reviewers | List the AI reviewers (agents) configured in DevDigest: name, what each checks, model, and whether it is enabled. Pass a name to devdigest_run_agent_on_pull_request or devdigest_get_findings. |
| `devdigest_run_agent_on_pull_request` | Run a DevDigest review | Run one DevDigest reviewer on a pull request and wait up to 2 minutes for the result: verdict, counts by severity and the top findings. Spends LLM tokens — call it only when the user explicitly asks for a review. If the result has status "running", the review is still going on the server and was not cancelled: do NOT call this tool again for the same pull request and reviewer (that pays for a second review); call devdigest_get_findings with the returned run_id a minute later. |
| `devdigest_get_findings` | Read DevDigest review findings | Read the result of a DevDigest review run on a pull request: verdict, score, and findings with file and line, most severe first. Defaults to the latest completed run; choose one with agent_name or run_id, narrow with min_severity, page with cursor. |
| `devdigest_get_conventions` | Read repository conventions | Read the coding conventions DevDigest extracted for a repository — accepted ones by default, pending candidates on request — each with category, rule and confidence. |
| `devdigest_get_blast_radius` | Blast radius (not implemented) | STUB — not implemented yet: always returns an error and no data. Planned: which code a pull request's changes can affect. Tell the user it is unavailable; do not estimate it. |

**Fixed result texts:**

- Blast stub (always `isError: true`): `devdigest_get_blast_radius is not implemented yet — this tool is a stub and has no data. Tell the user that blast-radius analysis is not available through DevDigest's MCP server yet. Do not estimate it and do not retry.`
- Run tool `next_step` when `done` and more findings exist: `Showing the top <k> of <n> findings. For the full list with filters call devdigest_get_findings with run_id <id> (e.g. min_severity: "WARNING").`
- Run tool `next_step` when `running`: `The review is still running on the DevDigest server and has NOT been cancelled. Do not call devdigest_run_agent_on_pull_request again for this pull request and reviewer — that would start and pay for a second review. Call devdigest_get_findings with run_id <id> in about a minute.`

### Tool contracts

General rules (defined in `tools/shared.ts`):
- Common fields: `repository` (string, `owner/name`) and `pull_request_number` (integer ≥ 1).
- `response_format` is `"concise" | "detailed"`, default `"concise"`.
- All schemas are `z.object({...})` (Zod 4, `zod/v4`).
- Success = `structuredContent` (validated against `outputSchema`) + one text block holding the same compact JSON.
- Error = `isError: true` + one text block.

1. `devdigest_list_agents`
   - Input: `z.object({ response_format })`, with describe "detailed adds strategy, gate policy and version". The callback is `(args, ctx)`.
   - Output: `{ agents: { name: string; description: string; provider: string; model: string; enabled: boolean; strategy?: string; ci_fail_on?: string; repo_intel?: boolean; version?: number }[]; total: number; message: string | null }`.
   - Annotations: `readOnlyHint: true`, `openWorldHint: false`.
2. `devdigest_run_agent_on_pull_request`
   - Input: `repository`, `pull_request_number`, and `agent_name` (string 1–200, trimmed; describe "Reviewer name from devdigest_list_agents, e.g. Security Reviewer").
   - Output: `{ run_id: string; agent_name: string; repository: string; pull_request_number: number; pull_request_title: string; status: "done" | "running"; started_new_run: boolean; elapsed_seconds: number; verdict: string | null; score: number | null; summary: string | null; finding_counts: { CRITICAL: number; WARNING: number; SUGGESTION: number } | null; findings_total: number | null; top_findings: { severity: "CRITICAL" | "WARNING" | "SUGGESTION"; category: string; title: string; file: string; start_line: number; end_line: number }[]; next_step: string }`.
     - `top_findings` holds ≤ 5 items and ≤ 2,000 chars.
     - `failed`, `cancelled`, `missing` and API errors are `isError` results without `structuredContent`.
   - Annotations: `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: false`, `openWorldHint: true`.
3. `devdigest_get_findings`
   - Input:

     | Field | Type | Default | Describe |
     |---|---|---|---|
     | `repository` | common field | — | — |
     | `pull_request_number` | common field | — | — |
     | `agent_name?` | 1–200 | — | "Only runs of this reviewer" |
     | `run_id?` | `z.uuid()` | — | "A run_id from devdigest_run_agent_on_pull_request; omit for the latest completed run" |
     | `min_severity` | `"CRITICAL" \| "WARNING" \| "SUGGESTION"` | `"SUGGESTION"` | "Lowest severity to include" |
     | `include_dismissed` | boolean | `false` | "Also return findings the user dismissed" |
     | `limit` | 1–50 | 20 | — |
     | `cursor?` | ≤ 300 | — | "next_cursor from the previous call" |
     | `response_format` | concise \| detailed | `"concise"` | "detailed adds rationale, suggestion and run cost" |

   - Output: `{ repository; pull_request_number; pull_request_title; run: { run_id; agent_name: string | null; status: "running" | "done" | "failed" | "cancelled" | "unknown"; ran_at; verdict; score; summary; error; provider?; model?; duration_ms?; tokens_in?; tokens_out?; cost_usd?; grounding? }; findings: { severity; category; title; file; start_line; end_line; confidence; triage: "open" | "accepted" | "dismissed"; kind?; rationale?; suggestion? }[]; total_matching; returned; next_cursor: string | null; message: string | null }`.
   - Annotations: `readOnlyHint: true`, `openWorldHint: true`.
4. `devdigest_get_conventions`
   - Input:
     - `repository`;
     - `status` (`"accepted" | "pending" | "all"`, default `"accepted"`; describe "pending = candidates nobody has confirmed yet");
     - `category?` (`naming | structure | imports | typing | error-handling | testing | formatting | other`);
     - `limit` (1–100, default 30);
     - `cursor?`;
     - `response_format` (describe "detailed adds the evidence location and snippet").
   - Output: `{ repository; conventions: { category; rule; confidence; status: "accepted" | "pending"; evidence?; evidence_snippet?; edited? }[]; counts: { accepted; pending }; total_matching; returned; next_cursor; message }`.
   - Annotations: `readOnlyHint: true`, `openWorldHint: false`.
5. `devdigest_get_blast_radius`
   - Input: `repository`, `pull_request_number`. No `outputSchema`.
   - Result: always the stub text, as `isError: true`.
   - Annotations: `readOnlyHint: true`, `openWorldHint: false`.

### Errors

- **Input validation (SDK):** `isError: true`, "Input validation error: Invalid arguments for tool <name>: <field>: <reason>". The handler does not run.
- **Tool execution errors** (via `runTool`, `isError: true`), with the texts from steps 4, 5, 7 and 9:
  - lookups: unknown repository / PR / agent / run; an ambiguous agent; no completed run; an invalid cursor;
  - API failures: unreachable, timeout, 4xx, 5xx, 429;
  - the run tool: `failed`, `cancelled` or `missing`, or three consecutive API errors while waiting;
  - the blast stub;
  - unexpected exceptions, with the stack sent to stderr only.
  Handlers never throw.
- **Not errors:**
  - the run tool reaching its limit, or being aborted, while the review is still running → normal `running` result;
  - `get_findings` on a running run → normal result with a message.
- **Protocol errors:** only for an unknown tool name.

### Environment

| Variable | Default | Range / values | Meaning |
|---|---|---|---|
| `DEVDIGEST_API_URL` | `http://localhost:3001` | loopback only | DevDigest API base URL |
| `DEVDIGEST_MCP_TIMEOUT_MS` | 10,000 | 1,000–60,000 | per HTTP request |
| `DEVDIGEST_RUN_WAIT_MS` | 120,000 | 5,000–600,000 | run tool's wait before returning `running` |
| `DEVDIGEST_MCP_LOG` | `info` | `silent`/`error`/`info`/`debug` | stderr log level |

On the Claude Code side, `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS` (default 120,000; `0` disables) moves a long tool call to the background (Open question 9).

## Verification

- Modules to typecheck: `mcp-server`. There are no tests in round 1. No other module changes.

  ```bash
  cd /home/alexandr/Developer/dev-digest/mcp-server && npm_config_verify_deps_before_run=false pnpm run typecheck
  ```

- Extra checks:
  - **Gate wiring (step 2).** Expect no `warning:` line, `mcp-server:typecheck=pass`, and no `mcp-server` unit-tests entry.

    ```bash
    cd /home/alexandr/Developer/dev-digest && node .claude/skills/pr-self-review/scripts/collect-diff.mjs && node .claude/skills/pr-self-review/scripts/route.mjs && node .claude/skills/pr-self-review/scripts/ci.mjs
    ```

  - **Throwaway stdio and text checks (step 10 (ii) and (iii)).** These scripts are not committed and run from the repo root. The report states what was verified: a hand-written 2025-06-18 handshake, stdout purity, five tools, schema rules, exit on EOF, verbatim texts. It also states what was not verified: the 2026-07-28 handshake and a real client.
  - **Live Claude Code check.** Needs the API running via `./scripts/dev.sh`. It confirms the relative command path / working directory, `${VAR:-default}`, tool search and the 2026-07-28 connection:
    - `claude mcp list` shows `devdigest` connected;
    - `/mcp` lists five tools;
    - "Which DevDigest reviewers exist?" calls `devdigest_list_agents`.

    ```bash
    cd /home/alexandr/Developer/dev-digest && claude mcp list
    ```

  - **Live run-tool timing check** (owner's go-ahead: LLM cost; needs a provider key in DevDigest Settings).
    1. Record `claude --version`; auto-background needs v2.1.212+.
    2. Ask "Run the Security Reviewer on acme/payments-api#482".
    3. Record:
       - how long the call blocked;
       - the returned `status`;
       - whether Claude Code backgrounded the call;
       - whether the agent then used `devdigest_get_findings` instead of re-running;
       - the real duration in the DevDigest UI.
    4. Repeat with `DEVDIGEST_RUN_WAIT_MS=110000`, then with `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS=0`.
    5. Record the results in `mcp-server/insights.md`.
  - Deferred to round 2: unit tests, the stdio smoke test, size measurement (step 11), the evaluation kit (step 12).
  - Not needed: migration generation, client build, hermetic e2e.
  - Before the PR: `/pr-self-review`.

## Open questions

1. **Test tooling** (`@modelcontextprotocol/client`, vitest) — deferred with the tests (owner: "skip tests for now").
   - Assumed: round 2 asks for approval again before steps 11–12 and the deferred tests.
   - Affects: round 2.
2. **Type-checking the vendored Zod 3 contracts from this Zod 4 package**, via the alias `zod` → `./node_modules/zod/v3`.
   - Assumed: `tsc` accepts it.
   - If not: local `src/api/types.ts` with only the fields used. These drift silently from the server; the owner chooses.
   - Affects: steps 1, 4, 8.
3. **`.mcp.json` path resolution.** It uses a command path relative to the repo root and `${VAR:-default}`, which assumes Claude Code starts project stdio servers with the project root as working directory and supports that syntax.
   - Assumed: yes, to be confirmed by the live check.
   - If not: an absolute path or a project-dir variable.
   - Affects: step 10.
4. **Which `$schema` draft Zod 4's `z.toJSONSchema`, through the SDK, writes into `tools/list`.**
   - Assumed: 2020-12, or none.
   - Step 10 (ii) records the value; stop if it is another draft.
   - Affects: steps 6, 10.
5. **SDK v2 names to confirm with `tsc`:**
   - the `CallToolResult` type;
   - the handler context's abort-signal property;
   - (round 2) the `Client` methods and whether `InMemoryTransport.createLinkedPair()` connects to this server.
   - Assumed: as named.
   - Affects: steps 5, 9; round 2.
6. **`devdigest_get_findings` results.** "No completed run" returns `isError`; "still running" returns a normal result.
   - Assumed: as written.
   - Affects: step 7.
7. **`devdigest_get_conventions` default.** It defaults to `accepted`; on the seeded DB every convention is `pending`.
   - Assumed: accepted by default.
   - Affects: step 8.
8. **Double-run guard.** The API starts a second run of the same agent on the same PR without objection.
   - Assumed: when that agent has a `running` run on the PR, send no POST and wait on it (`started_new_run: false`).
   - Alternatives: refuse with `isError`, or always POST and only warn.
   - Affects: step 9.
9. **120 s vs Claude Code's auto-background at 120 s.** The wait limit sits exactly on Claude Code's background threshold, and the answer can arrive up to one HTTP timeout late.
   - Recommendation: keep 120 s as the documented limit, but stop the internal wait about 10 s earlier (≈ 110 s).
   - Alternative: keep exactly 120 s and document the Claude Code env var.
   - Assumed: exactly `DEVDIGEST_RUN_WAIT_MS` = 120,000. The owner decides after the live run-tool timing check.
   - Affects: steps 3, 9, Verification.
10. **Poll vs stream.**
    - Assumed: poll `GET /pulls/:id/runs` every 4 s — at most 30 requests per call, one DB query each.
    - Alternative: the SSE stream `GET /runs/:id/events`, which needs a hand-written parser plus a polling fallback.
    - Affects: step 9.
11. **Keep the `devdigest_` prefix** even though Claude Code also namespaces tools (`mcp__devdigest__devdigest_*`).
    - Assumed: keep it.
    - Affects: steps 6–9.
12. **`pnpm-workspace.yaml` esbuild placeholder.** `server/` and `client/` keep theirs untouched.
    - Assumed: keep it unchanged. Set `esbuild: false` or `true` only if `pnpm install` cannot finish non-interactively; the implementer reports the choice.
    - Affects: step 1.
13. **Not verified; affects docs only:**
    - whether Claude Code forwards both `content` and `structuredContent` to the model;
    - whether `readOnlyHint` changes permission prompts;
    - how long a cold `tsx` start takes.
    - Assumed: content only; no effect; fast enough.
    - Affects: steps 10, 13; round 2.

## For reviewers

- **Round 1 has no tests by owner decision.** Review against "Final texts" and the throwaway-check report from step 10.
- **Architecture:**
  - Check the owner-confirmed HTTP wrapper: no runtime import from `../server`, only `import type` from `@devdigest/shared`.
  - `main.ts` is the only place that constructs `DevDigestApi`, picks `systemClock` and calls `serveStdio`.
  - Tools stay thin; shared logic lives in `shared.ts`, `paging.ts`, `findings-view.ts` and `wait-for-run.ts`.
  - Use SDK v2 only, Zod only as `zod/v4`, and time only through `clock.ts` (the step 3/5 `grep` checks enforce these while the source-rules test is deferred).
  - pnpm with the hoisted `.npmrc`; `.mcp.json` launches `tsx` directly.
- **Run tool:**
  - at most one POST per call; never a cancel or delete;
  - deadline and abort return a normal `running` result;
  - the double-run guard keys on same agent + same PR + `running`;
  - about 15 GET/min while waiting;
  - the "do not call again" wording appears in the description, the instructions and `next_step`.
- **Security:**
  1. `DEVDIGEST_API_URL` is loopback-only; `DEVDIGEST_RUN_WAIT_MS` is bounded.
  2. There is a single POST path (step 9's `grep` check).
  3. `sanitizeText` and the caps on LLM-written text in `get_findings` and `top_findings` guard against prompt injection.
  4. `runTool` must catch everything, so the SDK never forwards raw exception text.
  5. The run tool stays out of every auto-approve list.
  - Out of scope: the API has no auth, and `server.ts:35` listens on `0.0.0.0`.
- **Size:** consider one PR for steps 1–9 and a second for steps 10 and 13.
