# DevDigest

Local-first AI pull-request review. Course starter: import a PR, run an agent
review on it, triage findings.

## Stack

TypeScript everywhere. No monorepo workspace — each folder below has its own
`package.json`/lockfile, installed and run independently; cross-package code
goes through tsconfig path aliases, not published npm packages.

## Run everything

```sh
./scripts/dev.sh            # docker (Postgres) → migrate → seed → server:3001 + client:3000
./scripts/dev.sh --db-only  # just Postgres + migrate + seed
```

Only Postgres runs in Docker (`pgvector/pgvector:pg16`, port 5433→5432). API
and web run on the host via `pnpm dev`.

## Map

| Folder           | Package                    | What it is                                         |
|------------------|-----------------------------|-----------------------------------------------------|
| `server/`        | `@devdigest/api`            | Fastify API + Drizzle/Postgres                      |
| `client/`        | `@devdigest/web`            | Next.js 15 web app (the studio)                     |
| `reviewer-core/` | `@devdigest/reviewer-core`  | Pure review engine: diff → prompt → LLM → findings  |
| `e2e/`           | `@devdigest/e2e`            | Deterministic browser e2e (agent-browser, no LLM)   |
| `docs/agent-prompts/` | —                       | Reviewer system-prompt content, read at runtime by `reviewer-core` — not agent docs |

Each module folder above has its own `CLAUDE.md` (auto-loaded when you touch
files inside it) plus `docs/`, `specs/`, and `insights.md` — see the bottom of
this file.

## Conventions

- `@devdigest/shared` and `@devdigest/ui` are **not real packages** — they're
  vendored copies duplicated into `server/src/vendor/*` and `client/src/vendor/*`.
  There is no sync script. They can drift (they already have — check both
  sides when you change a shared Zod contract).
- Review is **never** auto-triggered by PR import or polling — always an
  explicit `POST /pulls/:id/review`.

## Do not touch

- `server/src/db/migrations/*.sql` — generate via `drizzle-kit generate`
  (`pnpm db:generate` in `server/`), never hand-edit an applied migration.
- `devdigest_pgdata` docker volume — never `docker compose down -v` to "reset"
  your DB; it deletes every imported repo/review. See `e2e/README.md` for the
  hermetic alternative used by e2e.

## Session protocol

**Before starting work on a task**, read the `insights.md` of every module
the task touches (routing table in
[`engineering-insights`](.claude/skills/engineering-insights/SKILL.md)),
plus the root `insights.md` for cross-cutting or infra work. State in one
line what you loaded. Treat those entries as high-confidence guidance unless
they contradict this file or the code in front of you.

**When the task ends**, run the `engineering-insights` skill. It appends
only what is substantive and not already recorded — writing nothing is the
correct outcome for a routine task. Do not skip the check.

## Module docs

- [`server/CLAUDE.md`](server/CLAUDE.md) · [`server/docs/`](server/docs/) · [`server/specs/`](server/specs/) · [`server/insights.md`](server/insights.md)
- [`client/CLAUDE.md`](client/CLAUDE.md) · [`client/docs/`](client/docs/) · [`client/specs/`](client/specs/) · [`client/insights.md`](client/insights.md)
- [`reviewer-core/CLAUDE.md`](reviewer-core/CLAUDE.md) · [`reviewer-core/docs/`](reviewer-core/docs/) · [`reviewer-core/specs/`](reviewer-core/specs/) · [`reviewer-core/insights.md`](reviewer-core/insights.md)
- [`e2e/CLAUDE.md`](e2e/CLAUDE.md) · [`e2e/README.md`](e2e/README.md) (already the e2e docs) · [`e2e/insights.md`](e2e/insights.md)
- [`insights.md`](insights.md) — cross-cutting and infra learnings that don't belong to one module
