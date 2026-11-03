# e2e/insights

Append-only log of things learned the hard way while working in `e2e/`.
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

- **2026-11-03** — A flow step can only fail on a non-zero exit or a missing `assert.stdoutIncludes` substring (`e2e/lib/assert.ts`, `e2e/run.ts`), and `wait --text` proves presence only — there is no absence, count or order primitive. Put "no X control", "no doc text" and "order persists" checks in component tests and keep flows to presence and persistence-after-reload; a plan that asks a flow for absence or order cannot be met (`e2e/specs/10-project-context-page.flow.json`).

## Tool & Library Notes

- **2026-11-03** — agent-browser `find` takes an action (`click`, `focus`, `fill`), and an icon-only control has no visible text for `wait --text`. To prove such a link or button exists without leaving the page or triggering it, use `find role link|button focus --name "<aria-label>"`; clicking an external `target=_blank` link would hit the network. `e2e/specs/14-onboarding-tour.flow.json`

## Recurring Errors & Fixes

## Session Notes

## Open Questions
