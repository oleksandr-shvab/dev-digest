# Severity rubric

Every reviewer uses this scale. `CRITICAL` blocks the PR, so it is deliberately narrow.

| Severity | Meaning |
|---|---|
| **CRITICAL** | The change, as written, introduces one of: a correctness bug or data loss; an exploitable vulnerability or leaked secret; a broken contract (Zod/API/schema/migration) that consumers will hit; a Dependency-Rule/purity violation that makes code untestable without a live external system (onion-architecture's own CRITICAL list); or a hard "do not" from CLAUDE.md. |
| **HIGH** | Bypasses an existing seam or will bite on the next refactor/test/provider swap; conditional or low-impact vulnerability; missing error handling on a real failure path. |
| **MEDIUM** | Consistency/maintainability drift. |
| **LOW** | Polish, defense-in-depth. |
| **INFO** | Not a defect (e.g. a check that could not run). |

## Using each skill's own scale

- `react-best-practices`, `frontend-ui-architecture`, `onion-architecture`: they tag rules
  CRITICAL/HIGH/MEDIUM — **use the tag of the rule that is violated**.
- `security`: use its Severity Classification table (CRITICAL = direct exploit, no auth).
- Skills with no scale (`fastify`, `drizzle`, `zod`, `next`, `typescript-expert`,
  `postgresql-table-design`): use the definitions above. Style, naming, or "could be nicer"
  is **never** CRITICAL.

## Scope discipline

- Judge only what the diff **introduces or changes**. A problem that already exists in an
  unchanged line is `in_diff: false` (reported, never blocks).
- CRITICAL requires concrete evidence: the quoted code and the specific rule/line of the
  skill it violates. If you cannot quote both, it is not CRITICAL.
- When unsure between two levels, choose the lower one; the verifier only sees CRITICALs.
