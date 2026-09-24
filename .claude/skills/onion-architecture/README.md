# Onion Architecture — Overview & Sources

Companion to [SKILL.md](SKILL.md) (the operational rules). This file holds
the "why": the terminology decisions made for this repo and every external
source used to research them.

## Scope

This skill covers **layering and dependency direction** in the backend
only:

- Which ring a piece of code belongs in (domain/application core, port,
  adapter, delivery) and which direction imports are allowed to flow
- Where a *new* external integration (LLM provider, git host, secrets
  backend) should be introduced, in what order
- The role of the composition root (`container.ts`) and why concrete
  construction is centralized there
- The boundary that keeps `reviewer-core` a pure, dependency-free engine

It deliberately does **not** cover:
- Fastify request-lifecycle mechanics (hooks, schemas, plugins) — that's
  [`fastify-best-practices`](../fastify-best-practices/SKILL.md).
- Drizzle query/schema/migration patterns — that's
  [`drizzle-orm-patterns`](../drizzle-orm-patterns/SKILL.md) and
  [`postgresql-table-design`](../postgresql-table-design/SKILL.md).
- Frontend code placement — that's
  [`frontend-ui-architecture`](../frontend-ui-architecture/SKILL.md), the
  closest sibling skill in spirit (placement rules grounded in this repo's
  actual structure).

## Decisions for This Repo

Research surfaced places where Onion, Clean, and Hexagonal Architecture
sources use different vocabulary for close-to-identical ideas, and places
where classic Onion/DDD guidance doesn't match what this codebase already
does. Each was resolved against `server/`'s and `reviewer-core/`'s actual
structure rather than picking a "purest" framing in the abstract.

1. **Onion vs. Hexagonal vs. Clean — which vocabulary to use.** All three
   share the same Dependency Rule (dependencies point inward;
   infrastructure depends on the core, never the reverse) and differ mostly
   in how many named rings they draw and where DDD concepts sit. This repo
   already has an explicit `@devdigest/shared` **ports** file
   (`server/src/vendor/shared/adapters.ts`) separate from **adapters**
   (`server/src/adapters/*`) — that's Ports-and-Adapters (Hexagonal)
   vocabulary at the interface level, layered with Onion's concentric
   rings for everything else (domain core → application services →
   infrastructure/delivery). **Decision: use "Onion Architecture" as the
   named skill (matches what the user asked for and how the rings are
   drawn in SKILL.md's table), but keep "ports"/"adapters" as the term for
   the interface/implementation split, since that's the vocabulary already
   in the code** (`adapters.ts`, `src/adapters/`). Don't invent a third
   naming scheme.

2. **Rich domain entities vs. this repo's functional core.** Palermo's
   original Onion posts and most DDD-flavored write-ups assume domain
   *objects* with behavior attached (an `Order` entity with a `.cancel()`
   method). `reviewer-core` and `server/src/db` instead use plain data
   shapes (Zod-inferred types, Drizzle `$inferSelect` row types) with all
   logic living in service/module functions (`reviewPullRequest()`,
   `ReviewService` methods). **Decision: document the functional-core
   pattern as this repo's actual answer, explicitly call out DDD
   entity/aggregate patterns as not-applicable** (see SKILL.md's "Not
   Applicable" section) rather than pushing the team toward an
   entity-class style nothing here uses today.

3. **Where the "core" lives when there's no monorepo workspace.** Most
   Onion/Clean write-ups assume one codebase with internal folders
   (`domain/`, `application/`, `infrastructure/`). This repo's root
   `CLAUDE.md` explicitly says there's no workspace — `reviewer-core/` is a
   separate package consumed via a tsconfig path alias. **Decision: treat
   `reviewer-core` itself as the Domain+Application core ring for the
   review engine**, and `server/src/modules/*/service.ts` as the
   Application Services ring for everything `server`-specific
   (workspace/PR/agent orchestration) that isn't part of the portable
   review engine. This matches Oliver Drotbohm's "Sliced Onion" framing
   (§ below) better than a single monolithic core would.

4. **`dependency-cruiser` as enforcement vs. documentation-only.** The
   package is already a `server/` devDependency, used at runtime by the
   `depgraph` adapter to analyze *other* repos for repo-intel — but there
   is no project-level `.dependency-cruiser.cjs` linting `server/`'s own
   layering. **Decision: document a draft config in
   [examples.md](examples.md) as a proposal, explicitly marked "not yet
   added"** — adding real CI enforcement is a team decision (new lint step,
   possible false positives on day one) and shouldn't happen as a silent
   side effect of using this skill.

## References

### Origin — Onion Architecture

- **Jeffrey Palermo — The Onion Architecture: part 1** — https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/
- **Jeffrey Palermo — The Onion Architecture: part 2** — https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/
- **Herberto Graça — Onion Architecture** (The Software Architecture Chronicles) — https://medium.com/the-software-architecture-chronicles/onion-architecture-79529d127f85 — clearest breakdown of the four rings (Domain Model → Domain Services → Application Services → Infrastructure/UI) and the DDD tie-in
- **Oliver Drotbohm — Sliced Onion Architecture** — http://odrotbohm.github.io/2023/07/sliced-onion-architecture/ — source for Decision §3 (multiple cores/slices instead of one monolithic core)

### Onion vs. Clean vs. Hexagonal — terminology

- **Milan Jovanović — Clean vs Onion vs Hexagonal** — https://milanjovanovic.tech/blog/clean-architecture-vs-onion-vs-hexagonal
- **Eric Damtoft — Onion vs Clean vs Hexagonal Architecture** — https://medium.com/@edamtoft/onion-vs-clean-vs-hexagonal-architecture-9ad94a27da91
- **Alistair Cockburn — Hexagonal Architecture (Ports & Adapters), 2005** — origin of the "ports"/"adapters" vocabulary this repo's code already uses (`server/src/vendor/shared/adapters.ts`, `server/src/adapters/`)

### Node.js / TypeScript implementations

- **Remo Jansen (dev.to) — Implementing SOLID and the Onion Architecture in Node.js with TypeScript and InversifyJS** — https://dev.to/remojansen/implementing-the-onion-architecture-in-nodejs-with-typescript-and-inversifyjs-10ad
- **Sankhadip Samanta — Onion Architecture in Node.js with TypeScript** — https://sankhadip.medium.com/onion-architecture-in-node-js-with-typescript-5508612a4391
- **generalistprogrammer.com — Hexagonal Architecture (Ports & Adapters) Guide + TypeScript** — https://generalistprogrammer.com/tutorials/hexagonal-architecture-complete-guide
- **generalistprogrammer.com — Repository Pattern: Complete Guide with TypeScript Examples** — https://generalistprogrammer.com/tutorials/repository-pattern-complete-guide — source for the "Repository Owns Persistence" rule's framing (repository interface as the DIP abstraction between domain and DB)
- **Khalil Stemmler — Dependency Injection & Inversion Explained (Node.js w/ TypeScript)** — https://khalilstemmler.com/articles/tutorials/dependency-injection-inversion-explained/ — source for the Composition Root framing used in SKILL.md

### Fastify + Drizzle specifically

- **256Taras — fastify-typescript-drizzle-starter-kit** — https://github.com/256Taras/fastify-typescript-drizzle-starter-kit — DDD Lite / Clean Architecture Lite on Fastify 5 + Drizzle + CQS; closest published example to this repo's actual stack
- **Its-Praduman09 — fastify-drizzle-enterprise-backend** — https://github.com/Its-Praduman09/fastify-drizzle-enterprise-backend — Routes/Controllers/Services/Schemas separation with Zod validation, same shape as `server/src/modules/*`

### Pitfalls (the "Not Applicable" / caution sections in SKILL.md)

- **Wikipedia — Anemic domain model** — https://en.wikipedia.org/wiki/Anemic_domain_model
- **Florin Sorocianu — The Pitfalls of Anemic Domain Models: Why Encapsulation Matters** — https://medium.com/@florin.sorocianu/the-pitfalls-of-anemic-domain-models-why-encapsulation-matters-2353f3570fb4 — source for the "Avoid Anemic Services" rule (adapted here to service-layer logic since this repo doesn't use entity classes — see Decision §2)

### Repo evidence (primary source — highest authority for this skill)

Every "Good" example in [examples.md](examples.md) and every ring mapping
in SKILL.md's table was checked directly against `server/` and
`reviewer-core/` on 2026-09-21:
- `server/src/vendor/shared/adapters.ts` — port interfaces (`GitHubClient`,
  `LLMProvider`, `SecretsProvider`, `GitClient`, `CodeIndex`, `Embedder`,
  `AuthProvider`)
- `server/src/adapters/github/octokit.ts`,
  `server/src/adapters/llm/{openai,anthropic}.ts` — adapters implementing
  those ports
- `server/src/platform/container.ts` — composition root, lazy
  construct-and-cache pattern, `ContainerOverrides` for tests
- `server/src/modules/reviews/{routes,service,repository}.ts` — thin
  route → application service → repository chain, including the
  repository's own docstring ("the ONLY layer touching the DB for the
  review domain")
- `server/test/routes-smoke.test.ts` — `overrides: { github: ... }` as the
  actual testability payoff of the ports/composition-root pattern
- `reviewer-core/CLAUDE.md`, `reviewer-core/src/review/run.ts`,
  `reviewer-core/package.json` — the zero-I/O purity boundary and its
  enforcement today (convention + minimal dependency list, not yet linted)
- `server/package.json` — confirmed `dependency-cruiser` is already a
  devDependency (via the `depgraph` adapter), motivating the enforcement
  proposal in examples.md
- root `CLAUDE.md` — "no monorepo workspace" constraint that shapes
  Decision §3

---

*Version 0.1.0 — 2026-09-21. See [SKILL.md](SKILL.md) for the changelog.*
