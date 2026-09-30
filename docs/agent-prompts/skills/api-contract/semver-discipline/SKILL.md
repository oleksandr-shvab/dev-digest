---
name: semver-discipline
description: Flag a breaking API change that ships without the major version bump it requires.
---

# Semver discipline

When a diff makes a breaking change (see `breaking-change` / `response-schema`),
check that the diff also bumps whichever version marker this API uses:

- the package's own version (`package.json` `version` field) — a breaking
  change needs a MAJOR bump, not patch/minor
- an API version prefix or header (`/v1/...` → `/v2/...`, an
  `Api-Version` header) — a breaking change needs a new version, with the
  old one kept serving until it's formally retired
- a changelog/migration note describing the break, when this repo has no
  automated version bump

Flag only when you already identified a breaking change AND the diff has no
matching bump/migration note.

## Good / Bad

**Bad** — a required field removed, version untouched:
```diff
- "version": "1.4.0",
+ "version": "1.4.1",
- export const Pull = z.object({ score: z.number() });
+ export const Pull = z.object({}); // score removed, still "1.4.1"
```

**Good** — the same removal, shipped as a major bump with a note:
```diff
- "version": "1.4.0",
+ "version": "2.0.0",
+ // MIGRATION: `score` removed from Pull; see docs/migrations/2.0.md
```

## Do not flag
- A patch/minor bump alongside a non-breaking change (bug fix, additive
  field) — that's correct semver, not a violation.
- A breaking change already covered by `breaking-change`/`response-schema`
  IF this diff also bumps the major version or version prefix correctly.
- Internal refactors with no external version marker at all (nothing this
  repo publishes or versions).
