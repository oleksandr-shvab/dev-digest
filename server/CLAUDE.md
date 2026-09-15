# server — `@devdigest/api`

Fastify API + Drizzle/Postgres. Owns PR import, the review pipeline, and
findings persistence. See root [`CLAUDE.md`](../CLAUDE.md) for the whole-repo
map.

## Commands

`dev` / `build` / `typecheck` / `test` / `db:generate` / `db:migrate` /
`db:seed` — see `package.json`.

## Map

- `src/modules/` — one folder per feature, each with its own `routes.ts` +
  service/repo: `pulls`, `reviews`, `agents`, `polling`, `repos`, `repo-intel`,
  `settings`, `workspace`. Registered in `modules/index.ts`.
- `src/db/schema/` — Drizzle schema, one file per entity group
  (`pulls`, `agents`, `runs`, `reviews`). `src/db/migrations/` is generated.
- `src/adapters/` — I/O boundaries: `github` (Octokit), `llm` (Anthropic/
  OpenAI/OpenRouter providers), `git` (simple-git), `secrets`, `astgrep`,
  `codeindex`, `depgraph`, `embedder`, `tokenizer`.
- `src/platform/` — cross-cutting: DI `container.ts`, `sse.ts` (live run
  events), `run-logger.ts`, `price-book.ts`, `resilience.ts` (retry/timeout).
- `src/vendor/shared` — vendored copy of `@devdigest/shared` (see root
  `CLAUDE.md` conventions — keep in sync with `client/src/vendor/shared`).

## Conventions

- Every route goes through `getContext()` for workspace scoping and Zod
  validation (`fastify-type-provider-zod`); errors flow to the central
  handler in `app.ts`.
- The actual LLM call lives in `reviewer-core`, not here — this package only
  orchestrates (loads diff, resolves provider, persists results, streams
  SSE). Don't put prompt-assembly or grounding logic in `server/`; it belongs
  in `reviewer-core/`.

## Gotchas

- `POST /pulls/:id/review` returns immediately (creates `agent_runs` rows,
  then runs the actual work in a fire-and-forget `void` promise). If you're
  debugging "nothing happened," check `run_traces` / the SSE stream, not the
  HTTP response.
- `GET /repos/:id/pulls` silently falls back to persisted data when GitHub/
  the token is unavailable — a failing GitHub call won't fail the read.

## Do not touch

- `src/db/migrations/*.sql` — regenerate via `pnpm db:generate`, never hand-edit.

## More

Read [`insights.md`](insights.md) before touching files in this module;
append to it through the `engineering-insights` skill when a task here
teaches something non-obvious.

[`docs/`](docs/) · [`specs/`](specs/) · [`insights.md`](insights.md)
