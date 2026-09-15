# server/insights

Append-only log of things learned the hard way while working in `server/`.
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

- **2026-09-15** — `agent_runs` (list/summary fields) and `run_traces`
  (the full per-run document, PK = `run_id`) are separate tables with no
  cascade-on-insert between them — `server/src/db/seed.ts` seeding a demo
  `agent_runs` row does NOT make `GET /runs/:id/trace` return anything; it
  404s (`Run trace not found`) unless you also `db.insert(t.runTraces)`
  for that same run id. See the Security Reviewer run seeded in
  `server/src/db/seed.ts` for the pattern (both inserts, same `runId`).

## Tool & Library Notes

## Recurring Errors & Fixes

- **2026-09-15** — `server/.env` with `LOG_LEVEL=` (present but empty) fails
  `EnvSchema.parse` in `server/src/platform/config.ts:60` with `Invalid enum
  value... received ''`, even though the field is `.optional()` — Zod's
  `.optional()` only tolerates a *missing* key, not an empty string, so this
  breaks both `pnpm dev` and every Testcontainers `*.it.test.ts` file (they
  all `loadConfig()` too). Fix: delete the line or set a real level (e.g.
  `LOG_LEVEL=info`), not `LOG_LEVEL=`.

## Session Notes

## Open Questions
