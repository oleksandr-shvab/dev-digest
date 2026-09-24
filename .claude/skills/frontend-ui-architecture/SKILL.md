---
name: frontend-ui-architecture
description: "Frontend UI code architecture and placement for React + Next.js App Router. Use when deciding where a component, hook, constant, utility/helper, type, or piece of business logic should live, when scaffolding a new feature/route, or when reviewing code organization/folder structure. Covers component folder shape, colocation vs. shared-folder promotion rules, constants/utils/types placement, business-logic layering (hooks vs. lib vs. API client), barrel-file (index.ts) policy, and the Server/Client Component placement boundary. Complements react-best-practices (component behavior) and next-best-practices (Next.js file-convention mechanics) — this skill is about where code goes, not how it behaves."
version: 0.1.0
---

# Frontend UI Architecture

Where frontend code goes — not how it behaves. Complements
[react-best-practices](../react-best-practices/SKILL.md) (component
behavior, hooks, state, memoization) and
[next-best-practices](../next-best-practices/SKILL.md) (Next.js file-
convention mechanics: route groups, parallel routes, RSC async rules).
Don't re-derive those here — cross-link instead.

These rules are grounded in `client/`'s existing structure (Next.js 15 App
Router, React 19), not a generic framework-agnostic ideal. Full source list
and the reasoning behind each rule: [README.md](README.md).

## Severity Levels

- **CRITICAL** — Breaks the established pattern; will cause real drift/bugs
- **HIGH** — Will hurt discoverability or cause the anti-patterns cited in README.md
- **MEDIUM** — Consistency / maintainability

---

## Component Folder Shape (CRITICAL)

Every component gets its own folder, named after the component
(PascalCase), containing:

- `ComponentName.tsx` — the component
- `index.ts` — single-export barrel: `export { ComponentName, ComponentName as default } from "./ComponentName";`
- `constants.ts` — component-local constants (only if needed)
- `helpers.ts` — component-local pure functions (only if needed)
- `styles.ts` — component-local style objects/class-name helpers (only if needed)
- `ComponentName.test.tsx` — colocated test

This is the established pattern throughout `client/src` (e.g.
`src/app/agents/_components/AgentCard/`,
`src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/`,
`src/components/app-shell/`). Follow it for every new component — don't
invent a variant per feature.

## Where Components Live (HIGH)

- Default: colocate under the route that owns it, inside that route's
  `_components/` folder (Next.js private folder — excluded from routing).
  Nest `_components/` again inside a component's own folder for its
  sub-components — this mirrors the route tree (see
  `RunTraceDrawer/_components/FindingsSection/`).
- Promote to top-level `src/components/` only once a component is used by
  2+ routes/features — not preemptively. This is the colocation principle:
  *"colocate until it hurts, then abstract."*
- Never place a route-specific component in `src/components/` "just in
  case." That's premature promotion and the fastest way `src/components/`
  turns into a dumping ground.

## Constants (MEDIUM)

- Colocate in the owning component/route's `constants.ts` — same folder as
  the component. This is universal across `client/src` today (17+
  examples) — don't break the pattern by inventing a shared constants
  location for something that's only used once.
- No global `src/constants/` folder. Promote a constant only when 2+
  unrelated features need the *exact same* value — then it goes in
  `src/lib/` as a named file, not a generic `constants.ts`.

## Utils / Helpers (MEDIUM)

- Component-local pure functions → colocated `helpers.ts` next to the
  component (see `AgentCard/helpers.ts`, `AppShell/helpers.ts`,
  `FindingCard/helpers.ts`).
- Cross-cutting utilities (used by 2+ features) → `src/lib/` as a
  descriptively named file (`cost.ts`, `github-urls.ts`,
  `model-label.ts`) — never a catch-all `utils.ts` grab-bag. Name the file
  for what it does, not for the fact that it holds functions.
- This repo does not distinguish `utils/` vs `helpers/` as separate
  top-level folders — colocated `helpers.ts` handles the local case,
  `src/lib/` handles the shared case. Don't introduce a third bucket.

## Business Logic Placement (CRITICAL)

- All data fetching and mutation logic lives in `src/lib/hooks/*`, one file
  per domain (`reviews.ts`, `agents.ts`, `repo-intel.ts`) — never ad-hoc
  `fetch`/`axios` inside a component body (already stated in
  `client/CLAUDE.md`'s Conventions section).
- Domain hooks call the shared HTTP client (`src/lib/api.ts` —
  `apiFetch`/`ApiError`), never `fetch` directly.
- A component's *own* internal orchestration hooks (not domain/data hooks)
  live in a `hooks/` subfolder next to that component (e.g.
  `app-shell/hooks/useShellContext.ts`, `useShellCommands.ts`). Keep the
  distinction: domain data hooks are global (`lib/hooks/`), a component's
  internal-only hooks are colocated with it.
- Components stay presentational: render + call hooks. If a component body
  has non-trivial branching or calculation, extract it to that component's
  `helpers.ts` rather than inlining it in JSX or the function body.

## Types (MEDIUM)

- Type used in one file → declare inline in that file.
- Type shared within one component/feature → colocate (inline in the
  component file, or a local `.types.ts` if it's large).
- Type shared across features → `src/lib/types.ts` (already exists — use
  it, don't create a second global types file).

## Barrel Files / `index.ts` (HIGH — narrow exception, not a general license)

- Every component folder gets a single-export `index.ts`
  (`export { X, X as default } from "./X"`). This is safe: one export, no
  aggregation, no tree-shaking or circular-import risk. Keep doing this —
  it is not the pattern the "avoid barrel files" advice warns against.
- A small, domain-scoped *aggregating* barrel (`export * from "./x"`
  across a handful of related files) is acceptable at a genuine shared
  boundary — e.g. `src/lib/hooks/index.ts` (aggregates 5 domain-hook
  files, with a comment explaining both import styles resolve) or
  `vendor/ui/index.ts`. Keep these few, stable, and documented like that
  one is.
- Never create a new app-wide or `src/components/index.ts`-style barrel
  aggregating many unrelated components — that's the pattern that breaks
  tree-shaking and causes circular imports (see README.md sources on
  barrel files). If in doubt, import from the specific file.

## Server/Client Component Boundary (HIGH — placement, not performance)

- This app has no Server Actions (`'use server'` does not appear anywhere
  in `client/src`) — all mutations go through the hooks/API-client layer
  above, not Next.js Server Actions. Don't introduce Server Actions
  without discussing it first; it's a different data-flow model than the
  rest of the app already uses.
- Push `'use client'` down to the leaf components that actually need
  interactivity/state/browser APIs; page/layout shells stay Server
  Components by default when they don't need it. (Mechanics of
  `'use client'`/async Server Components: see `next-best-practices`.)
- A Data Access Layer (`lib/dal/` + the `server-only` package) is a
  pattern for apps that query a database directly from Server Components.
  **Not applicable here** — `client/` talks to `@devdigest/api` over HTTP
  via `lib/api.ts`, which already plays that role. Don't add a `dal/`
  folder.

## When to Split a Component (MEDIUM)

- Split when it produces genuine reuse (used in 2+ places) or a narrower
  single responsibility — not just because a file feels long. This
  complements `react-best-practices`' "max 200 lines" rule: that's the
  symptom-based trigger, this is the reuse/responsibility-based one.
- If you find yourself describing what a component does with "and", it's
  doing too much — extract the second responsibility into its own
  component or hook.

## Import Style

- Use the `@/*` path alias (`@/lib/hooks`, `@/components/app-shell`)
  instead of relative `../../..` chains — already configured in
  `tsconfig.json`.

## Not Applicable to This Repo

Don't cargo-cult these from external sources — they were considered and
rejected for `client/`'s actual scale/shape (see README.md's "Decisions
for this repo"):

- Feature-Sliced Design's full layer taxonomy (`entities`/`widgets`/
  `features`) — `client/` uses route-colocation instead.
- A top-level `features/` folder (bulletproof-react style) — same reason.
- Atomic design's atoms/molecules/organisms taxonomy for whole-app
  structure — `vendor/ui/` is the closest thing to a shared design-system
  layer and doesn't follow that taxonomy.

---

## Changelog

- **0.1.0** (2026-09-21) — Initial version. Derived from `client/src`'s
  existing conventions plus the external sources catalogued in
  [README.md](README.md).
