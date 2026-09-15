# client — `@devdigest/web`

Next.js 15 / React 19 web app (the studio UI). See root
[`CLAUDE.md`](../CLAUDE.md) for the whole-repo map.

## Commands

`dev` (port 3000) / `build` / `typecheck` / `test` — see `package.json`.

## Map

- `src/app/` — Next.js App Router pages: `repos/[repoId]/pulls/[number]` (PR
  detail — findings, diff, overview tabs), `agents/`, `settings/`,
  `onboarding/`.
- `src/components/` — shared UI: `app-shell`, `page-shell`, `diff-viewer`,
  `mermaid-diagram`, `repo-not-found`, `showcase`.
- `src/lib/hooks/` — React Query hooks per domain (`reviews.ts` drives run
  triggering, SSE subscription, findings fetch/accept/dismiss).
- `src/vendor/shared`, `src/vendor/ui` — vendored copies (see root
  `CLAUDE.md` conventions — `vendor/shared` must mirror `server/src/vendor/shared`).

## Conventions

- Data fetching goes through the hooks in `src/lib/hooks/`, not ad-hoc
  `fetch` in components.
- Live review progress is SSE (`EventSource` against `/runs/:id/events`) plus
  a 4s poll of `/runs/active` as a durable fallback — both are already wired
  in `useRunEvents`/`usePrActiveRuns`; don't add a second polling mechanism.

## Gotchas

- `@devdigest/shared` here is a separate copy from `server/src/vendor/shared`
  — if you add/change a Zod contract, update both.
- Score shown on the PR list (`CircularScore`) is computed server-side per
  PR's latest review, not derived client-side.

## More

Read [`insights.md`](insights.md) before touching files in this module;
append to it through the `engineering-insights` skill when a task here
teaches something non-obvious.

[`docs/`](docs/) · [`specs/`](specs/) · [`insights.md`](insights.md)
