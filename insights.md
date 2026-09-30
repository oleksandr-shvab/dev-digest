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

- **2026-09-24** — pnpm 12.4.1 here runs an implicit `pnpm install` before any `pnpm <script>` when it thinks `node_modules` is outdated (`verify-deps-before-run`), which mutated real deps and then failed with `ERR_PNPM_IGNORED_BUILDS` (esbuild/protobufjs/ssh2 build scripts) — so a "typecheck failed" that was really an install failure. Any tool that shells out to `pnpm typecheck`/`pnpm test` outside a deliberate install must set `npm_config_verify_deps_before_run=false`. `.claude/skills/pr-self-review/scripts/ci.mjs`
- **2026-09-29** — On this machine, the real `devdigest-postgres` container (13+ days old, holding actual imported data) runs under the Docker CLI's `default` context, while `docker context ls` shows `desktop-linux` as the selected one — so plain `docker ps` / `docker compose up -d` see nothing, and `./scripts/dev.sh --db-only` then tries to create a second container that fails with `ports are not available: ... 0.0.0.0:5433`. Check `docker --context default ps` before concluding Postgres isn't running.

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

- **2026-09-21** — There is an untracked, unrelated-looking `dev-digest/`
  directory at the repo root (`git status` shows `?? dev-digest/`) that is
  actually a full nested clone of this same repo (~14MB, its own `.git`,
  `server/`, `client/`, `e2e/`, etc.) — likely an accidental `git clone` run
  inside the repo itself. Repo-wide `find`/`grep` from root will double-hit
  results inside it; don't mistake a match under `dev-digest/*` for the real
  tree. Not deleted here — flagged for the user to confirm before removal.

## Open Questions
