# e2e — `@devdigest/e2e`

Deterministic browser e2e for the web app, driven by Vercel `agent-browser`
(CDP-based CLI, no Playwright, no LLM, no API key). Full write-up already
lives in [`README.md`](README.md) — read that first; this file only holds
what an agent needs before touching files here.

Note: this module's `specs/` holds **flow specs** (`NN-name.flow.json`,
agent-browser command lists), not the "feature spec" docs convention
described in the root `CLAUDE.md` — don't repurpose it.

## Commands

- `npm test` — runs flows against whatever is on `localhost:3000`/`3001`.
- `npm run e2e:hermetic` (`../scripts/e2e.sh`) — spins up an isolated,
  freshly-seeded stack on alternate ports, runs flows, tears down. **Use
  this one** unless you know your local dev DB matches the seeded state.

## Gotchas

- Flows target read-only seeded data (repo `acme/payments-api`, PR #482).
  Your local dev DB usually has other imported repos — running `npm test`
  straight against it makes flows 02/04/05 land on the wrong repo and fail.
- Never `docker compose down -v` to "reset" — deletes `devdigest_pgdata`
  along with every real repo/review you've imported (see root `CLAUDE.md`).
- Locators must stay deterministic (`--url`, `--text`, `find role|text|label`).
  Never use the AI `chat` command — it would make runs flaky and defeat the
  point of this suite.

## More

Read [`insights.md`](insights.md) before touching files in this module;
append to it through the `engineering-insights` skill when a task here
teaches something non-obvious.

[`README.md`](README.md) · [`insights.md`](insights.md)
