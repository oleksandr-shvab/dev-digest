# Skills

Reusable AI skills that provide specialized knowledge and workflows. Canonical location is `.claude/skills/` with a symlink at `.cursor/skills/ → ../.claude/skills` for Cursor compatibility. Shared with the team via version control.

## Catalog

| Skill | Scope | Description |
|-------|-------|-------------|
| [fastify-best-practices](fastify-best-practices/SKILL.md) | Backend | Fastify routes, plugins, JSON-schema validation, error handling |
| [drizzle-orm-patterns](drizzle-orm-patterns/SKILL.md) | Backend | Drizzle schema, queries, relations, transactions, migrations |
| [postgresql-table-design](postgresql-table-design/SKILL.md) | Backend | Postgres schema design, data types, indexing, constraints |
| [onion-architecture](onion-architecture/SKILL.md) | Backend | Layering/dependency direction: ports vs. adapters, composition root, thin routes, reviewer-core purity |
| [next-best-practices](next-best-practices/SKILL.md) | Frontend | Next.js App Router, RSC boundaries, data fetching, optimization |
| [react-best-practices](react-best-practices/SKILL.md) | Frontend | React anti-patterns, state management, hooks rules |
| [frontend-ui-architecture](frontend-ui-architecture/SKILL.md) | Frontend | Where code goes: component placement, constants/utils/types, business-logic layering |
| [react-testing-library](react-testing-library/SKILL.md) | Frontend | General-purpose React Testing Library guide with Vitest |
| [zod](zod/SKILL.md) | Full-stack | Zod schema validation, parsing, error handling, type inference |
| [typescript-expert](typescript-expert/SKILL.md) | Full-stack | Type-level programming, performance, tooling, migrations |
| [security](security/SKILL.md) | Full-stack | OWASP Top 10:2025, auth, injection, uploads, secrets |
| [dependency-checker](dependency-checker/SKILL.md) | Full-stack | Dependency report for the repo and each package: scope, Mermaid graph (internal vs external), installed sizes, findings ranked P0/P1/P2/Info with concrete advice; read-only, backed by `scripts/collect.mjs` |
| [mermaid-diagram](mermaid-diagram/SKILL.md) | Shared | Mermaid diagrams in markdown (flowcharts, sequence, ERD, …) |
| [spec-creator](spec-creator/SKILL.md) | Meta | `/spec-creator`: feature-spec with traced, prioritized EARS criteria in the touched module's `specs/` (root `specs/` when cross-module); analyzes designs, runs parallel researchers, self-checks with `scripts/check-spec.mjs`, approves on confirmation |
| [run-plan](run-plan/SKILL.md) | Meta | `/run-plan plan:<path> [mode:single] [max-fix:N]`: runs an approved plan autonomously — implementers by the plan's dependency graph and owned paths → architecture-reviewer ‖ plan-verifier → bounded fix loop → report and a `/pr-self-review` recommendation; never pushes. Spec, plan and test-writer are run by hand |
| [analyze-workflow](analyze-workflow/SKILL.md) | Meta | `/analyze-workflow [deep] [session:<id>] [since:<ISO>]` — manual only: retro of a finished multi-agent run (order/parallelism, where the work went, hard/easy, duplicated, missed) with before → after proposals for agents and skills; default reads this conversation, `deep` reads the transcripts via `scripts/collect.mjs` for exact tokens; full report in chat, one entry appended to `docs/retro/ledger.md`, which also holds module insight candidates |
| [engineering-insights](engineering-insights/SKILL.md) | Meta | Capture session learnings into the touched module's `insights.md` |
| [pr-self-review](pr-self-review/SKILL.md) | Meta | Pre-PR gate: routes the local diff to the skills above by file type, blocks the PR on any confirmed CRITICAL finding |

## What Are Skills?

Skills are modular packages that extend the AI agent with specialized knowledge and workflows. Unlike rules (always applied) or agents (invoked for specific tasks), skills are loaded on-demand when the agent determines they're relevant.

### Skills vs Rules vs Commands vs Agents

| Type | Scope | Loaded | Purpose |
|------|-------|--------|---------|
| **Rules** (`.mdc`) | Project conventions | Always or by file pattern | Persistent guardrails |
| **Commands** (`.md`) | User actions | On `/command` invocation | Slash commands |
| **Skills** (`.md`) | Domain knowledge | On-demand by agent | Specialized knowledge |
| **Agents** (`.md`) | Workflows | Via Task tool | Subagent orchestration |

## Creating New Skills

Each skill has:

- `SKILL.md` — Main skill file with rules and conventions (required)
- `examples.md` — Code examples showing good/bad patterns (recommended)
- `references.md` — Sources and rationale (optional)
