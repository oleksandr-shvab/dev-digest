# Priority rubric

How to find issues, which tier each belongs to, and how to order them. The collector's
JSON field for each check is in brackets.

## Checklist

| # | Check | Collector field | Default tier |
|---|---|---|---|
| 1 | Relative import that leaves its package, or an alias with a wildcard that reaches into another package's internals instead of its public entry | `internalEdges` where `kind` is `relative`, or `alias` with `publicEntry: false` | **P0** (non-test code) |
| 2 | Imported in source but declared in no `package.json` section | `packages[].phantom` | **P0** if the importing file is runtime code, P1 if only tests |
| 3 | Same dependency declared with different version ranges in different packages | `drift` | **P1** if `majorDiffers`, else **P2** |
| 4 | Declared runtime dependency that nothing imports | `packages[].unused` with `section: dependencies` | **P1** when `confidence` is `medium`, **P2** when `low` |
| 5 | Declared devDependency that nothing imports | `unused` with `section: devDependencies` | **P2** |
| 6 | More than one lockfile in a package, or none | `lockfileIssues` | **P1** (`multiple-lockfiles`), **P2** (`no-lockfile`) |
| 7 | Vendored copies of the same folder whose files differ | `vendoredCopies[].differences` | **P1** |
| 8 | Two libraries that do the same job (dates, HTTP, test runner, validation) | `overlaps` | **P1** if the combined size is 5 MB or more, else **P2** |
| 9 | A single dependency that is very large for what it does | `packages[].topBySize` | **P2** |
| 10 | Internal edge that only tests use, pointing the wrong way (an inner package's test importing an outer package) | `internalEdges` with `testOnly: true` | **P2** |
| 11 | Internal edge through a public alias entry that `CLAUDE.md` documents (for example the vendored `@devdigest/shared`) | `internalEdges` with `publicEntry: true` | **Info** |

Raise or lower a tier only with a stated reason, for example "P1 → P0: this runtime
import breaks the production build".

## Tier definitions

- **P0 — fix before the next merge.** It breaks a documented architecture rule or can fail
  the build or runtime. Always includes the evidence line (`file:line`).
- **P1 — plan for this iteration.** It costs install weight, correctness or maintenance
  time now, and fixing it is bounded.
- **P2 — hygiene.** Low risk. Do it when you are already in that file.
- **Info.** A fact the reader should know. No action. Sizes, counts, documented edges.

## Ordering inside a tier

1. Blast radius: runtime code before tests; a dependency shared by several packages
   before one used in a single package.
2. Size or risk removed: more megabytes first; a major version gap before a patch gap.
3. Effort: smaller first, so quick wins sit at the top of the tier.

## Confidence

Carry the collector's confidence into the finding:

- **medium** — nothing in the package references the dependency in code, scripts,
  quoted strings or peer relations. Still verify with a text search before removing.
- **low** — something may still need it. Print the collector's `mayStillBeNeeded`
  reasons next to the finding (named in a script, quoted in a config file, a peer
  dependency of another package, imported by code reached through an alias).

Never put a `low` confidence removal in P0 or P1.

## Advice patterns

- **Unused dependency** — name the file and package, give the removal command, say what
  to check first. Present it as a recommendation.
- **Version drift** — recommend the version most packages already use, or say that
  aligning needs a migration (and which package would migrate) when the gap is a major
  version.
- **Deep import across packages** — name both files and the public entry the import
  should go through. If no public entry exists, recommend adding one.
- **Two lockfiles** — recommend keeping the one that matches `packageManager` or the
  package's scripts and deleting the other after a clean install check.
- **Differing vendored copies** — list which files differ and which copy is the source of
  truth according to `CLAUDE.md`. There is no sync script, so a manual sync is the action.
- **Overlap** — name which library the package already uses more and where the other is
  imported.

## What not to do

- Do not claim a package is outdated or vulnerable. Nothing here checks a registry.
- Do not call something unused without saying how it was checked.
- Do not list more than about 12 findings. Group repeats ("seven devDependencies unused in
  `e2e`") and keep the table readable.
- Do not recommend running anything that changes files as if it was already done.
