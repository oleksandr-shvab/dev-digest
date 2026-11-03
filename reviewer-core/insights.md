# reviewer-core/insights

Append-only log of things learned the hard way while working in
`reviewer-core/`. Read before starting work here (see root
[`CLAUDE.md`](../CLAUDE.md)'s Session protocol); append through the
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

- **2026-11-03** — `reviewer-core` is an npm package (`package-lock.json`); running `pnpm --dir reviewer-core exec …` there triggers an implicit pnpm install that fails with `ERR_PNPM_IGNORED_BUILDS` and leaves untracked `reviewer-core/pnpm-lock.yaml`, `reviewer-core/pnpm-workspace.yaml` and a `node_modules/.pnpm` layout behind. Use only `npm --prefix reviewer-core …` (as `.claude/agents/implementer.md` § Checks does), even when a plan's Done-when is written with `pnpm --dir`.

## Recurring Errors & Fixes

## Session Notes

## Open Questions
