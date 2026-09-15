# insights

Cross-cutting and infrastructure learnings that don't belong to one module —
`scripts/`, `docker-compose.yml`, `.github/workflows`, root config, or a
lesson spanning two or more of `server/`, `client/`, `reviewer-core/`,
`e2e/`. Module-specific learnings go in that module's own `insights.md`
instead — see the routing table in
[`engineering-insights`](.claude/skills/engineering-insights/SKILL.md).

Append-only, one dated bullet per entry, evidenced with a real path or
command (see
[`entry-format.md`](.claude/skills/engineering-insights/entry-format.md)).
Promote anything load-bearing up into `CLAUDE.md`; prune what stops being
true, but only on explicit request.

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

- **2026-09-15** — On this machine, the persistent `devdigest_pgdata` Docker
  volume can already hold a schema from a *later/fuller* version of the app
  (e.g. it had `agent_runs.cost_usd` plus `critical_count`/`warning_count`/
  `suggestion_count` — columns absent from this tree's `schema/runs.ts` —
  and 17 rows in `drizzle.__drizzle_migrations` vs. this tree's 10 migration
  files), so `pnpm db:migrate` fails with `column "X" of relation "agent_runs"
  already exists` even on a migration that's correct for a truly fresh DB.
  Confirm the affected tables are actually empty (e.g. `select count(*) from
  agent_runs;`) before concluding it's safe, then `docker compose down -v &&
  docker volume rm devdigest_pgdata` and re-run `./scripts/dev.sh --db-only`
  — get explicit user confirmation first, since this contradicts the "never
  `down -v`" rule in the root `CLAUDE.md` and that rule is right in general.

## Session Notes

## Open Questions
