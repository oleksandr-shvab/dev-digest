---
name: onion-architecture
description: "Layering and dependency-direction rules for devdigest's backend (server/, reviewer-core/): ports vs. adapters, composition root, and where business logic vs. persistence vs. HTTP delivery belongs, module boundaries (which module owns which tables, repositories and services), imports of another module's impure functions, and violations hidden in helper files, vendor types leaking through ports, and module cycles. Use when adding a new external integration (LLM provider, git host, API client), deciding whether code belongs in a route/service/repository/adapter, wiring something through the DI container, or reviewing backend folder structure for layering violations. Covers the Dependency Rule (inner layers never import outer layers), port-interface-first integration, thin Fastify routes, repository-owns-persistence, the composition root, and reviewer-core's zero-I/O purity boundary. Trigger terms: onion architecture, ports and adapters, hexagonal architecture, dependency inversion, composition root, layering, where does this code go, new adapter, new provider, DI container, service vs repository."
version: 0.2.0
---

# Onion Architecture

Dependency **direction** for devdigest's backend — not Fastify request
mechanics (see [fastify-best-practices](../fastify-best-practices/SKILL.md))
and not Drizzle query syntax (see
[drizzle-orm-patterns](../drizzle-orm-patterns/SKILL.md)). This skill is
about which layer is allowed to import which, and where a new piece of
logic or a new external integration belongs.

These rules are grounded in `server/` and `reviewer-core/`'s **existing**
structure — this repo already implements Onion / Ports-and-Adapters, it's
just never been written down. Full source list, terminology decisions, and
"why" for each rule: [README.md](README.md). Concrete good/bad code:
[examples.md](examples.md).

## The Rings, Mapped to This Repo

| Ring (Palermo's Onion) | This repo | Rule allowed to import |
|---|---|---|
| Domain Model + Domain Services | `reviewer-core/src/review/`, `prompt.ts`, `grounding.ts`, `output/` | nothing outside `reviewer-core` except `@devdigest/shared` types |
| Application Services | `server/src/modules/*/service.ts` | ports (interface types), its own module's repository |
| Ports (interfaces) | `server/src/vendor/shared/adapters.ts` (`GitHubClient`, `LLMProvider`, `SecretsProvider`, `GitClient`, `CodeIndex`, `Embedder`, `AuthProvider`) | nothing (pure types) |
| Infrastructure (adapters) | `server/src/adapters/*`, `server/src/modules/*/repository.ts` | the SDK/DB it wraps + the port it implements |
| UI / Delivery | `server/src/modules/*/routes.ts` | its own module's service, `_shared/context.ts` |
| Composition Root | `server/src/platform/container.ts` | everything — the one place allowed to |

`reviewer-core` as a whole is the Domain+Application core for the *review
engine specifically* — it is consumed by `server` (and, per its
`package.json` description, a future CI agent-runner) via a tsconfig path
alias, exactly like an inner ring being consumed by multiple outer shells.

## Severity Levels

- **CRITICAL** — breaks the Dependency Rule; creates real coupling or makes
  something untestable without a live external system
- **HIGH** — bypasses an existing seam; will bite on the next refactor,
  provider swap, or test
- **MEDIUM** — consistency / discipline, won't break today but drifts the
  pattern

---

## The Dependency Rule (CRITICAL)

Dependencies point inward, always. An inner ring never imports a concrete
type from an outer ring.

- `reviewer-core/*` never imports from `server/*`. It already can't — see
  the Purity rule below — but the general form of this also applies inside
  `server/`.
- `server/src/modules/*/service.ts` never imports a concrete class from
  `server/src/adapters/*` (e.g. `OctokitGitHubClient`,
  `AnthropicProvider`). It imports the **port type** from
  `@devdigest/shared` (`GitHubClient`, `LLMProvider`, …) and receives an
  instance through `Container`.
- `server/src/modules/*/routes.ts` never imports `server/src/adapters/*` or
  `server/src/db/schema*` directly. It calls its module's `service.ts`.

If you're adding code and find yourself reaching two rings out to import
something concrete, that's the signal the abstraction (port, or a method on
an existing service) is missing — add it, don't reach around it.

## `reviewer-core` Purity (CRITICAL)

`reviewer-core/CLAUDE.md` already states this; treat it as the Onion
Architecture core boundary, not a style preference:

> No DB/GitHub/filesystem/network imports. The only side effect allowed is
> the injected `LLMProvider`.

Concretely: no `node:fs`, `node:child_process`, `node:net`, no DB client, no
`octokit`, no `simple-git` import anywhere under `reviewer-core/src`. This
is what makes `reviewPullRequest()` (`reviewer-core/src/review/run.ts`)
callable from both `server`'s live studio and a future CI runner with zero
duplication — breaking it for a one-off convenience defeats the entire
reason the package exists as separate from `server/`.

## Port-Interface-First Integration (CRITICAL)

Adding a new external integration (a new LLM provider, a new git host, a
new secrets backend) always goes in this order:

1. Define or extend the port interface in
   `server/src/vendor/shared/adapters.ts` (and keep
   `client/src/vendor/shared` in sync if the type is shared — see root
   `CLAUDE.md`'s vendoring convention).
2. Implement it in `server/src/adapters/<kind>/<impl>.ts`, implementing that
   interface (e.g. `OctokitGitHubClient implements GitHubClient`).
3. Wire it in `server/src/platform/container.ts` — a getter or async
   resolver method, following the existing lazy-construct-and-cache
   pattern (`get codeIndex()`, `async llm(id)`).

Never call a third-party SDK directly from a `service.ts` or `routes.ts`.
The service should be able to run against a test double that implements the
same port with zero code changes — that's the actual point, not a rule for
its own sake (see `ContainerOverrides` in `container.ts`, used by
`server/test/routes-smoke.test.ts`).

## Thin Routes (CRITICAL)

`routes.ts` files do exactly four things: `getContext()` for workspace
scoping, `Schema.parse()` the input, call one or two methods on the
module's service, shape the response. No business logic, no direct
Drizzle/db access, no adapter calls. `server/src/modules/reviews/routes.ts`
is the reference shape — see [examples.md](examples.md).

This is already stated as a convention in `server/CLAUDE.md` for the
`getContext()`/Zod part; this rule extends it to "and therefore routes stay
thin" as the architectural consequence.

## Repository Owns Persistence (HIGH)

Only `*/repository.ts` (and its `repository/*.repo.ts` sub-files, e.g.
`server/src/modules/reviews/repository/`) imports `drizzle-orm` or
`server/src/db/schema*`. Services call repository methods; they never
construct a Drizzle query themselves. `ReviewRepository`'s own docstring
states this directly: "the ONLY layer touching the DB for the review
domain" — that line is the rule.

## Composition Root Is the Only `new` (HIGH)

`server/src/platform/container.ts` is the one place allowed to construct
concrete adapter/repository classes with `new`. Services receive them
through `Container` (constructor param) or a repository field built from
`container.db`. Tests inject fakes via `ContainerOverrides` instead of
mocking modules — that's the payoff of routing every concrete construction
through one root: swap the whole infrastructure ring without touching a
service.

## Module Boundaries (HIGH)

Each `server/src/modules/<name>/` owns its own tables, repository and
service. Another module may reuse them only through the shared seams the
composition root already exposes: `container.reviewRepo` (pulls, PR files,
reviews, findings, runs), `container.agentsRepo` (agents), and
`container.repoIntel` (index, blast radius). `container.ts` says why: those
repos are built there "so consuming modules use `container.agentsRepo`
instead of reaching into another module's folder".

Flag any of these in a module's `service.ts`, `routes.ts` or `repository.ts`:

- **Importing and constructing another module's repository or service** —
  `new ReviewRepository(container.db)` or `new AgentsService(container)`
  outside `modules/reviews/` or `modules/agents/`. Use the container getter;
  if none exists for that entity, add one to `container.ts` instead.
- **Querying another module's tables from your own repository** — e.g. a
  `digest` repository selecting from `t.reviews` or `t.findings`. That table's
  owner (`ReviewRepository`) is the only place that knows its shape; add a
  method there and call it through `container.reviewRepo`.
- **Writing to another module's tables**, for the same reason, but worse:
  the owning module's invariants are skipped.

Not a violation: importing another module's **pure** helpers, constants or
types (`pickLatestReviewPerAgent` from `../reviews/smart-diff/build.js`,
`type PullRow`). They carry no state and no I/O.

Pre-existing cases, so a review of new code can tell them apart:
`modules/conventions/service.ts` and `modules/repo-intel/routes.ts`
construct `RepoRepository`; `modules/brief/service.ts` constructs
`BlastService`. Report them only as already-present, not as part of a diff.

## Cross-Module Imports Must Be Pure (HIGH)

An import from another module's folder (`../reviews/...`, `../settings/...`) is
allowed only when what it brings in is **pure**: a constant, a type, or a
function that does no I/O and takes no `container`, `Db`, repository, client or
other port. Apply the test to the imported symbol, not to the file name: a
helper-looking file such as `diff-loader.ts` or `intent-sources.ts` is not
pure just because it is not called `service.ts`.

A function is impure when its signature takes `container`, `db`, a repository
or a port (`deps: { github: ... }`), or when its body reads the filesystem,
git, the database or the network. Importing one breaks the module boundary
even though nothing is built with `new`: the caller now depends on the owning
module's internals, persistence and wiring, and the owner can no longer change
them freely. Examples from this repo:

- `loadDiff(container, repo, ...)` from `../reviews/diff-loader.js` — git and
  database work.
- `fetchLinkedIssues({ github }, ...)` from `../reviews/intent-sources.js` —
  GitHub client calls.
- `resolveFeatureModel(container, ...)` from `../settings/feature-models.js` —
  reads the settings table.

Flag it in a `helpers.ts` or any other neighbour of the service too: a helper
file inherits the ring of its importer, so an impure cross-module import there
counts the same as one in `service.ts`.

Fix, whichever fits: call the owning module through a seam the container
already exposes (`container.reviewRepo`, `container.agentsRepo`,
`container.repoIntel`); add a getter for the behaviour to `container.ts`; or,
if both modules really need it, move the logic to `modules/_shared/` with its
dependencies passed in as ports.

Not a violation: pure helpers (`classifyFile`, `pickLatestReviewPerAgent` from
`../reviews/smart-diff/`), constants, `import type { PullRow }`, and
`container.reviewRepo.getPull(...)`.

Already present, so a review of new code reports them as pre-existing:
`modules/brief/service.ts` imports `fetchLinkedIssues` and
`resolveFeatureModel`; `modules/reviews/intent-deriver.ts` imports
`resolveFeatureModel`.

## Indirect Violations (HIGH)

A violation does not have to sit in a file named `service.ts` or `routes.ts`.
A file's ring is decided by who imports it, not by its name. When a review
covers more than a couple of files, build the import graph of the files
under review first: follow relative imports up to three hops, read every
file on the way, and check each edge against the ring table. Reading only
the files whose names match a ring misses exactly the violations that were
moved somewhere less visible.

- **Helper files inherit the ring of their importer.** A `helpers.ts`,
  `delivery.ts` or `recipients.ts` that a `service.ts` imports is
  Application-ring code. It may not import `server/src/adapters/*` or
  `drizzle-orm` / `server/src/db/schema*`, and may not `new` a concrete
  class. Report it at the helper and name the chain
  (`service.ts → delivery.ts → SlackNotifier`). Moving code out of the
  service into a neighbouring file does not remove the violation.
- **Ports do not leak vendor types.** An interface under
  `server/src/vendor/shared/` must not import, accept or return a type from
  a vendor SDK (`@slack/web-api`, `octokit`, `openai`, `@anthropic-ai/sdk`).
  The adapter maps the SDK response into a type the port owns; otherwise the
  port is the SDK in disguise and every caller depends on it. An adapter
  importing its SDK is fine — that is its job.
- **Modules do not form a cycle (MEDIUM).** If module A imports from module
  B and B imports from A, report it even when each import is a pure helper,
  constant or type that would be allowed on its own
  (`alerts/rules.ts → incidents/stats.ts → alerts/constants.ts`). File-level
  import cycles stay invisible here, so follow the edges between module
  folders. Fix: move what both need into a third place neither owns
  (`_shared/` or a new neutral module).

## Avoid Anemic Services (MEDIUM)

Onion Architecture's inner rings are meant to hold real behavior, not just
pass data through. If a `service.ts` method is doing nothing but
`return this.repo.get(...)` for several methods in a row with all the
actual decisions (retries, grounding, cost estimation, event emission)
scattered into adapters or routes instead, that's the anemic-service smell
— pull that logic back into the service (see `ReviewService` /
`ReviewRunExecutor` for the shape: orchestration + decisions live there,
adapters stay dumb I/O wrappers).

## Enforcing It: dependency-cruiser (HIGH — proposal, not yet wired)

`dependency-cruiser` is already a `server/` devDependency (used at runtime
by the `depgraph` adapter for repo-intel) but there is currently **no**
project-level `.dependency-cruiser.cjs` lint config enforcing any of the
above. When a task calls for hardening this (not just documenting it),
propose adding one with rules like: forbid `server/src/modules/**/service.ts`
→ `server/src/adapters/**` (concrete classes), forbid
`server/src/modules/**/routes.ts` → `server/src/db/**`, forbid
`reviewer-core/src/**` → Node built-ins (`fs`, `child_process`, `net`) or
`server/src/**`. See [examples.md](examples.md) for a draft config. Don't
add this unasked — it's a real lint dependency for the whole team and
belongs in a reviewed PR, not a silent side-effect of an unrelated task.

## Not Applicable to This Repo

- **Rich Domain Entities / DDD aggregates with methods.** Palermo's Onion
  and most DDD-flavored write-ups assume domain *objects* with behavior
  (`Order.cancel()`), not just types. `reviewer-core` and `server/src/db`
  use plain data shapes (Zod-inferred types, Drizzle row types) with logic
  living in service/module functions instead. That's a deliberate,
  already-established choice in this codebase (functional core over an
  OOP domain model) — don't introduce entity classes to chase DDD purity
  points that nothing here asked for.
- **A separate `domain/` folder inside `server/`.** `server/`'s
  "Application Services" ring already lives in `modules/*/service.ts`;
  don't create a parallel `domain/` layer duplicating it. The true
  inner-ring code for review logic already has its own package:
  `reviewer-core/`.
- **Full DDD tactical patterns (aggregates, value objects, domain events)
  beyond what's already here.** Out of scope unless a specific module's
  complexity actually calls for it — see README.md's "Decisions" for the
  reasoning.

---

## Changelog

- **0.2.0** (2026-11-12) — Added "Module Boundaries (HIGH)": no
  constructing another module's repository/service, no querying or writing
  another module's tables; go through `container.reviewRepo` /
  `agentsRepo` / `repoIntel`. Pure helpers and types stay importable.
  Also added "Indirect Violations (HIGH)": trace imports transitively; helper
  files inherit their importer's ring; ports must not leak vendor SDK types;
  no cycles between modules.
  Also added "Cross-Module Imports Must Be Pure (HIGH)": importing another
  module's function that takes the container or does I/O is a boundary
  violation even without `new`; pure helpers, constants and types are fine.
- **0.1.0** (2026-09-21) — Initial version. Derived from `server/`'s and
  `reviewer-core/`'s existing structure plus the external sources
  catalogued in [README.md](README.md).
