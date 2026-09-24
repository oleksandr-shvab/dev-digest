# Frontend UI Architecture — Overview & Sources

Companion to [SKILL.md](SKILL.md) (the operational rules). This file holds
the "why": the decisions made for this repo and every external source used
to research them.

## Scope

This skill covers **placement**, not behavior or routing mechanics:

- Where a component/hook/constant/util/type/business-logic function lives
- How a component's own files (`.tsx`, `index.ts`, `constants.ts`,
  `helpers.ts`, `styles.ts`, test) are organized as a folder
- When to promote something from colocated to shared
- Barrel-file (`index.ts`) policy
- Where the Server/Client Component split runs, architecturally

It deliberately does **not** cover:
- Component *behavior* (hooks correctness, memoization, state patterns,
  render-factory anti-patterns) — that's
  [`react-best-practices`](../react-best-practices/SKILL.md).
- Next.js *file-convention mechanics* (route-group/parallel-route syntax,
  async `params`/`cookies()`, RSC serialization rules, bundling/perf) —
  that's [`next-best-practices`](../next-best-practices/SKILL.md).

## Decisions for this repo

Research surfaced several places where respected sources disagree with
each other. Each was resolved by checking `client/src`'s actual structure
rather than picking a side in the abstract.

1. **Feature folders vs. route-colocation vs. flat top-level folders.**
   Bulletproof React and Feature-Sliced Design both prescribe a
   `features/`/`src/` layer above the framework's routing folder. Robin
   Wieruch's take is "start flat, promote as needed." `client/src` already
   has neither a `features/` folder nor an FSD `entities`/`widgets` split
   — it colocates every component under the Next.js route that owns it
   (`app/**/_components/`), nested arbitrarily deep, and promotes to
   `src/components/` only for genuinely cross-route UI (`app-shell`,
   `diff-viewer`, `page-shell`). **Decision: keep and document the
   existing route-colocation pattern.** Don't introduce a `features/`
   folder or FSD layers — that would be a large, unrequested restructuring
   with no evidence it's needed at this repo's current size.

2. **Barrel files (`index.ts`).** TkDodo and others argue against barrel
   files generally (tree-shaking, circular imports, IDE navigation).
   `client/src` uses two different flavors: (a) a single-export barrel per
   component folder (`export { X, X as default } from "./X"`) — the norm,
   present in 40+ folders — and (b) one small, documented, domain-scoped
   *aggregating* barrel at `src/lib/hooks/index.ts` (5 files). **Decision:
   keep both as-is.** (a) isn't the pattern the anti-barrel sources warn
   about (no aggregation, nothing to tree-shake around). (b) is exactly
   the narrow exception several sources carve out — small, stable, at a
   genuine shared boundary. The rule that generalizes: no *new*
   aggregating barrels beyond that narrow case, especially not an
   app-wide `src/components/index.ts`.

3. **Constants/utils placement.** No single canonical external source
   settles `utils/` vs `helpers/` vs colocated. `client/src` already has a
   consistent answer: local `constants.ts`/`helpers.ts` colocated per
   component (17+ and 10+ examples respectively), and `src/lib/` for
   anything shared, named for what it does (`cost.ts`, `github-urls.ts`,
   `model-label.ts` — never a catch-all `utils.ts`). **Decision: document
   the existing pattern, not import a `utils/` vs `helpers/` distinction
   from outside.**

4. **`app/` as a thin routing shell vs. code living inside `app/`.**
   Official Next.js docs allow both; the FSD + App Router guide picks the
   thin-shell variant (`app/` only holds `page.tsx`/`layout.tsx`/
   `route.ts`, everything else in `src/`). `client/src` puts feature code
   *inside* `app/**/_components/`, using Next.js private folders
   (`_components/`) rather than moving code outside `app/` entirely.
   **Decision: keep code inside `app/` via private folders** — that's the
   existing, working pattern; moving everything to a parallel `src/`
   tree would be churn without a stated problem it solves.

5. **Data Access Layer (DAL) / `server-only` pattern.** Standard advice
   for Next.js apps that query a database directly from Server Components.
   `client/` has no direct DB access — it calls `@devdigest/api` over HTTP
   through `src/lib/api.ts` (confirmed: no `'use server'` anywhere in
   `client/src`). **Decision: not applicable, explicitly called out in
   SKILL.md so it isn't cargo-culted in later** — `lib/api.ts` +
   `lib/hooks/*` already is this repo's data-access boundary.

6. **Atomic design.** Sources are split on whether it's still relevant.
   `client/src` doesn't use the atoms/molecules/organisms taxonomy
   anywhere; the closest thing to a shared design-system layer is
   `src/vendor/ui/` (see root `CLAUDE.md`'s vendoring convention), which
   doesn't follow that taxonomy either. **Decision: not applicable, don't
   introduce it.**

## References

### Architecture methodologies (considered, mostly not adopted — see Decisions §1)

- **Bulletproof React** — repo: https://github.com/alan2207/bulletproof-react · project structure: https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md · standards: https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md
- **Feature-Sliced Design** — site: https://feature-sliced.design/ · docs: https://feature-sliced.design/docs · https://feature-sliced.design/blog/scalable-react-architecture
- **Screaming Architecture** — https://profy.dev/article/react-folder-structure · https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25
- **Robin Wieruch — React Folder Structure [2026]** — https://www.robinwieruch.de/react-folder-structure/ (closest match to what `client/src` actually does)
- **Josh W. Comeau — Delightful React File/Directory Structure** — https://www.joshwcomeau.com/react/file-structure/
- **Tania Rascia — How to Structure and Organize a React Application** — https://www.taniarascia.com/react-architecture-directory-structure/
- Round-ups used to cross-check consensus: https://blog.webdevsimplified.com/2022-07/react-folder-structure/ · https://github.com/balajidharma/react-folder-structures

### Colocation principle (the rule the skill leads with)

- **Kent C. Dodds — Colocation** — https://kentcdodds.com/blog/colocation ("place code as close to where it's relevant as possible"; "colocate everything until it hurts, then abstract")
- **Kent C. Dodds — State Colocation Will Make Your React App Faster** — https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster

### Business logic placement (components vs. hooks vs. services)

- **React docs — Reusing Logic with Custom Hooks** — https://react.dev/learn/reusing-logic-with-custom-hooks
- **React docs — You Might Not Need an Effect** — https://react.dev/learn/you-might-not-need-an-effect
- **Felix Gerschau — Separation of Concerns with React Hooks** — https://felixgerschau.com/react-hooks-separation-of-concerns/
- **eMoosavi — Decoupling Business Logic from UI with Custom Hooks** — https://www.emoosavi.com/blog/decoupling-business-logic-from-ui-with-custom-react-hooks

### Constants / utils / helpers / types placement

- **Where Your Types Live Matters More Than You Think** — https://blog.serghei.pl/posts/where-your-types-live-matters/ (source of the promotion-ladder rule: one file → colocated `.types.ts` → central `types/` only when needed across unrelated features)
- **Wisp CMS — How Should I Organize My Types as a React Developer?** — https://www.wisp.blog/blog/how-should-i-organize-my-types-as-a-react-developer
- **Sufle.io — Naming Conventions in React** — https://www.sufle.io/blog/naming-conventions-in-react (`UPPER_SNAKE_CASE` constants, `PascalCase` enum names)

### Component decomposition (when/how to split)

- **Dmitri Pavlutin — 7 Architectural Attributes of a Reliable React Component** — https://dmitripavlutin.com/7-architectural-attributes-of-a-reliable-react-component/
- **When to Split a React Component (And When You're Over-Engineering)** — https://dev.to/137foundry/when-to-split-a-react-component-and-when-youre-over-engineering-2a6e
- **Single Responsibility Principle in React** — https://cekrem.github.io/posts/single-responsibility-principle-in-react/

### Atomic design (considered, not adopted — see Decisions §6)

- **Is Atomic Design Still Relevant in 2025?** — https://www.designsystemscollective.com/is-atomic-design-still-relevant-in-2025-d9c214788cfe

### Barrel files (`index.ts`) — split opinion, resolved in Decisions §2

- **TkDodo — Please Stop Using Barrel Files** — https://tkdodo.eu/blog/please-stop-using-barrel-files
- **Barrel Files: Why index.ts Re-Exports Hurt Tree Shaking, Next.js Dev Memory, and tsc (2026)** — https://reactuse.com/blog/barrel-files-tree-shaking/

### Style guides (naming conventions, secondary)

- **Airbnb React/JSX Style Guide** — repo: https://github.com/airbnb/javascript/tree/master/react · hosted: https://javascript.airbnb.tech/react/

### Next.js App Router — architecture (not performance)

- **Next.js docs — Project Structure** — https://nextjs.org/docs/app/getting-started/project-structure (states both organizational strategies: code inside `app/` vs. `app/` routing-only)
- **Next.js docs — Server and Client Components** — https://nextjs.org/docs/app/getting-started/server-and-client-components
- **Next.js docs — Guides: Server and Client Boundary** — https://nextjs.org/docs/app/guides/server-and-client-boundary (`'use client'` as a module-graph boundary, not a per-component flag)
- **Next.js docs — Guides: Data Security** — https://nextjs.org/docs/app/guides/data-security
- **Next.js blog — How to Think About Security in Next.js** — https://nextjs.org/blog/security-nextjs-server-components-actions (official DAL rationale)
- **makerkit.dev — Next.js 16 App Router Project Structure: The Definitive Guide** — https://makerkit.dev/blog/tutorials/nextjs-app-router-project-structure ("structure is the architecture")
- **feature-sliced.design — The Ultimate Next.js App Router Architecture** — https://feature-sliced.design/blog/nextjs-app-router-guide (thin-`app/`-shell pattern; considered, not adopted — see Decisions §4)
- **Server Actions placement** — https://github.com/orgs/community/discussions/184740 · https://makerkit.dev/blog/tutorials/nextjs-server-actions
- **Data Access Layer pattern** — https://aysh.me/blogs/data-access-layer-nextjs · https://medium.com/@samrose.mohammed/structuring-your-data-access-layer-in-next-js-patterns-that-actually-scale-2e4c07491866
- **`server-only` package** — https://www.builder.io/blog/server-only-next-app-router · https://makerkit.dev/blog/tutorials/server-only-code-nextjs
- **Server-first / client-islands framing** — https://www.yogijs.tech/blog/nextjs-project-architecture-app-router · https://www.iamraghuveer.com/posts/nextjs-server-vs-client-components/

### Repo evidence (primary source — highest authority for this skill)

Every "Good" example in [examples.md](examples.md) and every "Decision"
above was checked directly against `client/src` on 2026-09-21:
- `src/app/agents/_components/AgentCard/`, `.../AgentEditor/`,
  `src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/`,
  `.../RunTraceDrawer/` — component folder shape
- `src/lib/hooks/index.ts`, `src/lib/api.ts` — business-logic layering
- `src/components/app-shell/` (incl. `hooks/` subfolder) — component-
  internal hooks vs. domain hooks
- `client/CLAUDE.md` — documented "data fetching goes through hooks"
  convention
- `tsconfig.json` — `@/*` path alias configuration
- `grep -rl "'use server'" src` — confirmed no Server Actions in use

---

*Version 0.1.0 — 2026-09-21. See [SKILL.md](SKILL.md) for the changelog.*
