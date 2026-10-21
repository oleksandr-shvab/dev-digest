# mcp-server — `@devdigest/mcp-server`

Local stdio MCP server for DevDigest. Claude Code starts it from the repo's
`.mcp.json`; it exposes five `devdigest_*` tools (list reviewers, run a
reviewer on a pull request, read findings, read conventions, a blast-radius
stub) and fulfils each one by calling the already-running DevDigest API on
`http://localhost:3001`. It never touches the database or `server/` internals.
See root [`CLAUDE.md`](../CLAUDE.md) for the whole-repo map.

## Commands

- `pnpm install` — set up `node_modules` (hoisted layout, see `.npmrc`).
- `pnpm run typecheck` — `tsc --noEmit`.
- `pnpm start` — `tsx src/main.ts` (the stdio server; normally Claude Code starts it).
- Tests: deferred (round 2).
- Prefix every pnpm command with `npm_config_verify_deps_before_run=false`
  (root [`insights.md`](../insights.md), 2026-09-24).

## Map

| File | What it is |
|---|---|
| `src/main.ts` | Composition root: config → logger → `DevDigestApi` → `serveStdio` |
| `src/server.ts` | `createDevDigestMcpServer` — builds the `McpServer`, registers the five tools |
| `src/instructions.ts` | `SERVER_INSTRUCTIONS` (session-start text, ≤ 2,048 chars) |
| `src/config.ts` | Env parsing (`DEVDIGEST_API_URL` loopback only, `DEVDIGEST_MCP_TIMEOUT_MS`, `DEVDIGEST_RUN_WAIT_MS`, `DEVDIGEST_MCP_LOG`) |
| `src/log.ts` · `src/stdout-guard.ts` | stderr JSON logger · redirects `console.log/info/debug` to stderr |
| `src/clock.ts` | `Clock` + `systemClock` — the only `Date.now`/`setTimeout` |
| `src/api/client.ts` | `DevDigestApi` — the only HTTP; GET plus one POST (`startReview`) |
| `src/api/resolve.ts` | `owner/name` + PR number → ids; `ToolInputError`; per-process PR cache |
| `src/tools/shared.ts` | Input fields, `toolResult`/`toolError`, `runTool`, `describeApiError`, `sanitizeText`, size caps |
| `src/tools/paging.ts` · `findings-view.ts` · `wait-for-run.ts` | cursor paging · finding sort/count/map · the run tool's 4 s poll |
| `src/tools/list-agents.ts` · `get-findings.ts` · `get-conventions.ts` · `get-blast-radius.ts` · `run-agent-on-pull-request.ts` | one file per `devdigest_*` tool |
| `../.mcp.json` | Claude Code registration (repo root) |

## Conventions

- stdout is the JSON-RPC channel — never `console.log`; all logs go through
  `src/log.ts` to stderr.
- Talks only to the local API over HTTP; `@devdigest/shared` is `import type`
  only (tsconfig path alias to `../server/src/vendor/shared`).
- Zod only as `import * as z from 'zod/v4'`, never bare `zod` (bare `zod` is
  aliased to Zod 4's Zod 3 compatibility subpath, for the vendored contracts).
- SDK v2 only: `@modelcontextprotocol/server`, `registerTool` with `z.object`
  schemas — never `@modelcontextprotocol/sdk` or `server.tool()`.
- Every tool returns through `toolResult`/`toolError`; handlers never throw.
- Only `devdigest_run_agent_on_pull_request` may send a POST, at most one per
  call; its wait never cancels the run.
- Time only through the injected `Clock` (`src/clock.ts`).
- pnpm, launched in `.mcp.json` via `node_modules/.bin/tsx`, never via
  `pnpm exec`.

## Gotchas

- The DevDigest API must be running (`./scripts/dev.sh`).
- The first PR lookup per process triggers the API's GitHub sync in
  `GET /repos/:id/pulls`.
- Invalid arguments never reach a handler — the SDK answers them with an
  `isError` result.
- Claude Code backgrounds tool calls after `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS`
  (default 120 s).
- `pnpm-workspace.yaml` sets `esbuild: false`: pnpm refuses to finish
  `pnpm install` (`ERR_PNPM_IGNORED_BUILDS`) while the build-script decision
  is unset, and `tsx` runs without esbuild's build script.

## Do not touch

- No runtime import from `../server` (type-only imports from the vendored
  `@devdigest/shared` are the one exception).

## More

Read [`insights.md`](insights.md) before touching files in this module;
append to it through the `engineering-insights` skill when a task here
teaches something non-obvious.

[`README.md`](README.md) (the full explanation: tools, the run tool's wait,
errors, status and known limits) · [`insights.md`](insights.md)
