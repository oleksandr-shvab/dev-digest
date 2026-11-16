---
name: dependency-checker
description: "Analyze the dependencies of this repository and each of its packages (server, client, reviewer-core, e2e, mcp-server, evals) and produce one structured report: scope, a Mermaid dependency graph, installed sizes per package and per dependency, findings ranked P0/P1/P2/Info, and a short prioritized summary with concrete advice. Separates internal dependencies (tsconfig path aliases, relative imports across packages, vendored copies) from external npm packages. Read-only: it recommends changes and never runs install, update or remove. Use whenever the user asks about dependencies, package.json, node_modules or install weight, bloat, unused, duplicate, mismatched or drifting versions, what depends on what, a dependency graph or dependency check, or before adding or removing a package — even if they do not say 'dependency checker'. Також: залежності, граф залежностей, розмір пакетів, невикористані пакети."
---

# Dependency Checker

Turns "what do we depend on, how heavy is it, and what should we fix first" into one
report developers can act on. Every claim in it traces to evidence: a file and line,
or a field of the collector's output.

This repository is **not a monorepo workspace**: `server/`, `client/`, `reviewer-core/`,
`e2e/`, `mcp-server/` and `evals/` each have their own `package.json` and lockfile.
Code is shared through tsconfig path aliases and vendored copies, not `workspace:*`
packages. Say so in the report only when the collector confirms `workspace.declared`
is false, and never describe packages as linked by pnpm workspaces unless it is true.

## Hard rules

1. **Read-only.** Never run `install`, `add`, `remove`, `update` or `dedupe`, and never
   edit a `package.json` or lockfile. Every removal or upgrade is a recommendation the
   reader confirms. Write "recommended" or "to confirm", never "removed" or "fixed".
2. **No claims you cannot support.** No network access means no "outdated" and no
   "vulnerable" claims. Sizes are installed file sizes, not bundle sizes; say so once.
3. **Static analysis has blind spots.** "Unused" can be wrong for dynamic requires,
   config strings and CLI-only tools. Carry the collector's `confidence` and
   `mayStillBeNeeded` into the finding instead of hiding them.
4. **Specific or nothing.** Each finding names a package, a dependency or a file. A line
   like "consider optimizing dependencies" is not a finding.

## Workflow

1. **Get the data.**
   - If the user already pasted package.json contents, sizes or grep output, use that as
     the data and skip the script. Do not ask for tool access or more data.
   - Otherwise run `node .claude/skills/dependency-checker/scripts/collect.mjs` from the
     repo root. It prints one JSON document in under a second. Useful flags: `--top <n>`
     (heaviest dependencies per package, default 8), `--no-size` (skip size scan),
     `--root <dir>`.
   - Read `CLAUDE.md` for documented cross-package exceptions before ranking anything
     that is an internal edge.
2. **Classify.** Split every dependency into *internal* (another package in this repo,
   reached by alias, relative import or a vendored copy) and *external* (npm). Keep the
   two apart in the graph, the tables and the findings.
3. **Find issues.** Walk the checklist in
   [references/priority-rubric.md](references/priority-rubric.md): deep or relative
   imports across packages, undeclared imports, version drift, unused declarations,
   overlapping libraries, lockfile problems, drifting vendored copies, heavy packages.
4. **Rank.** Assign P0, P1, P2 or Info using the rubric. Order findings by tier, then by
   blast radius, then by effort.
5. **Write the report** in exactly the structure below. The full template, with a
   Mermaid example and a sample finding, is in
   [references/report-template.md](references/report-template.md). Read it before writing.

## Report structure

Use these five headings, in this order, spelled exactly like this. The prose under them
follows the user's language (Ukrainian prompt, Ukrainian prose); the headings stay English
so reports stay searchable and comparable.

```
# Dependency report — <repo or scope> — <YYYY-MM-DD>
## 1. Scope
## 2. Dependency graph
## 3. Size breakdown
## 4. Findings & Priorities
## 5. Summary
```

1. **Scope** — a table of the packages analyzed (name, path, package manager and lockfile,
   prod/dev counts) and a short "Method and limits" list: what was run, what was not
   checked (network, bundle size), and which results are low confidence.
2. **Dependency graph** — one fenced ```` ```mermaid ```` block using `flowchart`. Internal
   packages are nodes; internal edges are labelled with their kind (alias, deep alias,
   relative, test only, vendored). Add only the heaviest external dependencies, at most
   12, with sizes in the labels. Conventions are in the template reference.
3. **Size breakdown** — a table per package (node_modules total, top dependencies with
   size and prod/dev) and one table of the 10 heaviest dependencies repo-wide. Sizes in MB
   with one decimal.
4. **Findings & Priorities** — one summary table (ID, tier, where, finding, recommendation,
   effort, confidence) followed by a detail block per P0 and P1 finding with evidence, why
   it matters and the exact action. P2 and Info stay in the table.
5. **Summary** — 3 to 5 takeaways, ordered by priority, each actionable, then one
   **Next action** the reader can do in under two minutes.

## Priority tiers

| Tier | Meaning | Typical examples |
|---|---|---|
| **P0** | Breaks a documented rule or can break build or runtime. Fix before the next merge. | Relative or deep import into another package's internals; runtime import with no declaration. |
| **P1** | Real cost or risk, planned for this iteration. | Major version drift; unused runtime dependency; two lockfiles in one package; vendored copies that differ; two libraries doing one job. |
| **P2** | Hygiene, do it when touching the area. | Minor devDependency drift; unused devDependency; a heavy package with a lighter alternative. |
| **Info** | A fact, no action needed. | Sizes, counts, documented alias edges. |

Every finding carries one tier. The rubric in
[references/priority-rubric.md](references/priority-rubric.md) says how to pick it and how
to order within a tier.

## Recommendations

Each recommendation names the package, the file and the action, plus a command in the
package's own manager, written as something to run after confirming:

- "Remove `@fastify/autoload` from `server/package.json`
  (`pnpm --dir server remove @fastify/autoload`) after confirming nothing loads it by
  string — about 10 minutes."

Give effort in minutes or hours, not "some work": S is up to 15 minutes, M up to 2 hours,
L more than that.

## When the data is thin

If a package has no `node_modules`, its sizes are null: write "not installed" in the size
table and say in Scope that its numbers are declared-only. If the collector cannot be run
and nothing was pasted, say which part of the report is therefore missing instead of
estimating sizes.
