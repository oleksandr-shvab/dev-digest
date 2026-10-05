# client/insights

Append-only log of things learned the hard way while working in `client/`.
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

- **2026-09-25** — Importing a runtime value (not `import type`) from `@devdigest/shared` passes `tsc` and vitest but fails `pnpm build` with `Module not found: Can't resolve './contracts/brief.js'`, because the vendored barrel uses `.js` specifiers webpack can't map to `.ts`. Import only types from it and mirror needed constants locally, as `SKILL_NAME_RE` / `MAX_SKILL_BODY_CHARS` are in `src/lib/skill-meta.ts`.

## Codebase Patterns

- **2026-09-25** — `apiFetch` sets `content-type: application/json` whenever a body is present, which would break multipart uploads; it now skips that header for `FormData`, so file uploads go through `api.postForm`. `src/lib/api.ts`

## Tool & Library Notes

- **2026-09-25** — Keyboard reordering with `@dnd-kit/sortable` under jsdom only works if `HTMLElement.prototype.getBoundingClientRect` is stubbed with distinct row rects (jsdom returns all zeros), and `.focus()` on the drag handle must be wrapped in `act()` or React logs an act warning. `src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/SkillsTab.test.tsx`
- **2026-09-29** — The vendored kit's `Textarea` (`src/vendor/ui/kit/Textarea.tsx`) takes a fixed prop list with no `...rest` spread, so it cannot carry an `aria-label` — unusable wherever several instances render at once and each needs a unique accessible name (e.g. one edit textarea per card in a list). Render a plain native `<textarea>` with the same inline styles instead of the kit component in that case, as `ConventionCard.tsx` does.

## Recurring Errors & Fixes

## Session Notes

## Open Questions
