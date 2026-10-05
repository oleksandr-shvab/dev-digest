# project-rules (pseudo-skill)

Judgment rules that come from this repo's `CLAUDE.md` and module `insights.md` files, not
from a generic skill. (The mechanical ones — applied-migration edits, `down -v`, secrets,
vendored drift — are already checked by `scripts/checks.mjs`; do not repeat them.)

Read the reviewer's `insights` files first: they are high-confidence, project-specific
gotchas (e.g. workspace scoping in `server/src/modules/reviews`). A change that repeats a
mistake recorded there is at least HIGH.

## Rules

1. **Review is never auto-triggered.** Nothing on PR import, polling, or any other side
   effect may start a review; only an explicit `POST /pulls/:id/review`. New code that calls
   the review start/enqueue path from import/polling/webhook handlers → **CRITICAL**
   (`project-rules/review-auto-trigger`).
2. **Cross-package code goes through tsconfig path aliases**, not published packages. A new
   `dependencies` entry on `@devdigest/shared`, `@devdigest/ui` or `@devdigest/reviewer-core`
   in any `package.json` → **HIGH** (`project-rules/published-internal-package`).
3. **Shared Zod contracts live in two vendored copies.** If a schema in a
   `vendor/shared/contracts/**` file changed, the diff must show the same change on the other
   side, and the consuming code on both sides must still agree → **HIGH** if not
   (`project-rules/contract-one-sided`). (Byte-level drift is checked mechanically.)
4. **e2e stays deterministic.** Anything under `e2e/` that calls an LLM/provider or depends
   on network state → **HIGH** (`project-rules/e2e-nondeterministic`).
5. **`docs/agent-prompts/`** is runtime prompt content read by `reviewer-core`: an edit that
   removes a placeholder/section the loader depends on → **HIGH**
   (`project-rules/agent-prompt-contract`).
6. **Workspace scoping.** Every route goes through `getContext()` for workspace scoping and
   Zod validation (`server/CLAUDE.md`). A new/changed route that bypasses `getContext()`, or a
   query that reads/writes a workspace-owned row without the workspace filter its neighbours
   use → **CRITICAL** if it can leak across workspaces, else **HIGH**
   (`project-rules/workspace-scoping`).

Rule ids in findings: `project-rules/<kebab-name>` — use the ids given above.
