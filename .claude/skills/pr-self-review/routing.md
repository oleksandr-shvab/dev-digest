# Routing — why files go where they go

The executable source of truth is [routing.json](routing.json). A file goes to the **union**
of skills of every rule it matches. A skill with zero matching files is simply not run
(the coverage table shows it). Deleted and binary files are never sent to reviewers.

| Changed files | Skills | Why |
|---|---|---|
| `client/src/**/*.{ts,tsx}` (not tests, not `vendor/`) | `react-best-practices`, `frontend-ui-architecture`, `typescript-expert` | UI behavior, placement, types |
| `client/src/app/**`, `next.config.*` | + `next-best-practices` | file conventions, RSC boundaries |
| `client/**/*.test.*`, `client/src/test/**` | `react-testing-library` | test style |
| `server/src/**/*.ts`, `reviewer-core/src/**/*.ts` (not `vendor/`) | `onion-architecture`, `typescript-expert` | dependency rule, `reviewer-core` purity |
| `server/src/app.ts`, `server.ts`, `modules/**/routes*`, `platform/{sse,errors,config}.ts`, `server/test/**/*.it.test.ts` | + `fastify-best-practices` | HTTP layer only |
| `server/src/db/**/*.ts`, `modules/**/repository*` | + `drizzle-orm-patterns` | queries, transactions |
| `server/src/db/schema*`, `migrations/*.sql` | + `postgresql-table-design` | table/index design |
| `*/src/vendor/shared/**`; or any source file importing `zod` | `zod` | contracts and parsing |
| all source under `server/`, `client/`, `reviewer-core/` + `scripts/`, workflows, compose | `security` | full-stack skill: runs on **both** sides |
| everything code-like except tests | `project-rules` (pseudo-reviewer) | CLAUDE.md rules + module `insights.md` |
| docs, `.md`, `.claude/**`, lockfiles, generated | none (deterministic checks only) | |

**Never reviewers:** `mermaid-diagram` (authoring aid), `engineering-insights` (runs after
the task, per CLAUDE.md), `pr-self-review` itself.

**New skills.** `route.mjs` reads `.claude/skills/*/SKILL.md` and the scope column of
`.claude/skills/README.md`. A skill no rule mentions still runs via the scope fallback
(`Frontend` → `client/src`, `Backend` → `server/src` + `reviewer-core/src`, `Full-stack` →
both; `Meta`/`Shared` → not run) and is flagged **unrouted** in the report — add a real rule
to `routing.json` (and a row here) when you see that flag.

**Vendored code** (`client/src/vendor/*`, `server/src/vendor/*`) is excluded from
style/architecture skills (it is copied, not authored here) but still gets `zod` for shared
contracts and the deterministic drift check.
