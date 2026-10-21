# mcp-server/insights

Append-only log of things learned the hard way while working in `mcp-server/`.
Read before starting work here (see root [`CLAUDE.md`](../CLAUDE.md)'s
Session protocol); append through the
[`engineering-insights`](../.claude/skills/engineering-insights/SKILL.md)
skill when a task teaches you something non-obvious — one dated bullet per
entry, evidenced with a real path or command
(see [`entry-format.md`](../.claude/skills/engineering-insights/entry-format.md)).
Promote anything load-bearing up into `CLAUDE.md`; prune what stops being
true, but only on explicit request.

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

- **2026-10-16** — With pnpm 12.4.1, `pnpm install` here exits 1 with `ERR_PNPM_IGNORED_BUILDS` (esbuild@0.28.2, pulled in by `tsx`) while `pnpm-workspace.yaml` still holds the `allowBuilds: esbuild: set this to true or false` placeholder, even though all packages are already installed and `node_modules/.bin/tsx` works. Setting `esbuild: false` makes the install exit 0 and `tsx` still runs, so build scripts are not needed. `mcp-server/pnpm-workspace.yaml`
- **2026-10-16** — In `@modelcontextprotocol/server` 2.3.1 the tool handler's abort signal is `ctx.mcpReq.signal`, not `ctx.signal` (`node_modules/@modelcontextprotocol/server/dist/createMcpHandler-*.d.mts`, `BaseContext.mcpReq`). `CallToolResult`, `ServerContext`, `McpServer` and `McpServerFactory` are type exports of the package root; `serveStdio` comes from `@modelcontextprotocol/server/stdio`.
- **2026-10-16** — With Zod 4.2 schemas passed to `registerTool`, `tools/list` carries `"$schema": "https://json-schema.org/draft/2020-12/schema"` and root `type: "object"`, and the server answers a hand-written `protocolVersion: "2025-06-18"` `initialize` over `serveStdio`. A bad argument comes back as an `isError` result "Input validation error: Invalid arguments for tool X: …", not a JSON-RPC error.
- **2026-10-16** — Over stdio a JSON-RPC `notifications/cancelled` for an in-flight `tools/call` aborts `ctx.mcpReq.signal` but the SDK sends no response for that request id (nothing on stdout), and closing stdin while a call is still waiting makes the process exit within milliseconds because the same signal aborts. So a handler that waits (`src/tools/wait-for-run.ts`) must treat the abort as "return and stop", not as an error to report; its return value is dropped. Observed with a hand-written driver against `serveStdio`, SDK 2.3.1.
- **2026-10-16** — Cold start of `mcp-server/node_modules/.bin/tsx mcp-server/src/main.ts` (spawn to `initialize` result) measured 192–243 ms over six runs with the API not queried at startup; SIGINT, SIGTERM and stdin EOF each end the process with exit 0 within about 50 ms. `main.ts` exits 1 with a one-line stderr message and an empty stdout on invalid config (e.g. `DEVDIGEST_API_URL=https://example.com`).

## Recurring Errors & Fixes

## Session Notes

## Open Questions
