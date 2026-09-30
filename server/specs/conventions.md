# Conventions Extractor

Finds the coding conventions a repo already follows, lets the user triage
them, and turns the accepted ones into a `repo-conventions` skill linked to
agents. Sampling and evidence checking are plain code; the model is called
once per scan, only to propose candidates. A candidate whose evidence cannot
be found in the repo is dropped before anyone sees it.

Companion UI spec: [`client/specs/conventions.md`](../../client/specs/conventions.md).
Related: [`skills.md`](skills.md) (the skill the result becomes),
[`api-contract-reviewer.md`](api-contract-reviewer.md) (same homework, separate
feature).

## Background

Already in the tree and reused:

- Table `conventions` ([`schema/knowledge.ts`](../src/db/schema/knowledge.ts)),
  created in migration `0000`: `rule`, `evidence_path`, `evidence_snippet`,
  `confidence`, `accepted boolean`. No rows are written anywhere today.
- Contract `ConventionCandidate` in
  [`vendor/shared/contracts/knowledge.ts`](../src/vendor/shared/contracts/knowledge.ts)
  (and its client copy).
- `repoIntel.getConventionSamples(repoId, n)`
  ([`repo-intel/service.ts`](../src/modules/repo-intel/service.ts)): top-N
  files by rank, minus tests/configs/migrations. Returns `[]` when repo-intel
  is disabled (`REPO_INTEL_ENABLED=false`) or the repo is not indexed.
- Feature model `conventions` in `FEATURE_MODELS`
  ([`contracts/platform.ts`](../src/vendor/shared/contracts/platform.ts)) and
  `resolveFeatureModel` ([`settings/feature-models.ts`](../src/modules/settings/feature-models.ts)).
  The Settings → Models row already exists.
- `LLMProvider.completeStructured` (Zod schema + `schemaName`), and
  `MockLLMProvider.structuredBySchema` for tests
  ([`adapters/mocks.ts`](../src/adapters/mocks.ts)).
- Skills: `skills.source` already allows `'extracted'`, `skills.type` allows
  `'convention'`, `skills.evidence_files jsonb` exists and is unused.
  `AgentsService.linkSkill` appends a skill to an agent.

The gap: no `conventions` module, no routes, no prompt, no evidence check,
and `conventions.accepted` cannot express "rejected".

## Decisions

1. **Scope is one repo.** Candidates belong to `repo_id`. The page lives
   under the active repo.
2. **Sampling is code only** (criterion 39). Configs + top 12 files. No model
   picks files. The mock's two-step `ConventionFileSelection` dialogue is not
   used.
3. **One model call per scan**, structured output, model from
   `resolveFeatureModel(container, workspaceId, 'conventions')` — never a
   constant in the module (criterion 53).
4. **Evidence is one location per candidate**: `{ path, line, snippet }`.
   It matches the existing single-evidence columns, and the check stays one
   rule.
5. **Evidence check is strict and deterministic.** The path must be one of
   the files sent to the model, and the snippet must be found in that file
   within ±3 lines of the cited line. Otherwise the candidate is dropped.
   When found nearby, `line` is corrected to where it actually is.
6. **Status replaces `accepted`.** `status: 'pending' | 'accepted' |
   'rejected'`. Rejected rows stay in the DB, are hidden from the list, and
   suppress the same rule on a later scan (criterion 48).
7. **A scan is synchronous.** `POST …/extract` returns when candidates are
   stored (one LLM call, ≤ 120 s timeout). No job table, no SSE.
8. **ReScan keeps decisions.** It deletes `pending` rows only, keeps
   `accepted` and `rejected`, and skips new candidates whose normalised rule
   equals an existing kept row.
9. **Edit changes the words, not the evidence.** `rule` and `category` are
   editable; evidence stays as verified. An edited row gets `edited = true`.
10. **Skill creation is two-step, like import.** A draft endpoint builds the
    body from accepted candidates in code (no LLM); the user edits it in the
    modal; a create endpoint saves it. Nothing is written before Create.
11. **One skill, default name `repo-conventions`** (criterion 42),
    `type: 'convention'`, `source: 'extracted'`, `evidence_files` = the
    distinct evidence paths. If a skill with that name exists and its source
    is `extracted`, Create saves a new version of it (message
    `"Re-extracted from N conventions"`); if it exists with another source →
    `409`.
12. **Linking reuses the lab mechanism.** Create takes `agent_ids[]` and calls
    `AgentsService.linkSkill` for each (appended, enabled). That bumps the
    agent version exactly as a manual link does.

## Data model

Migration via `pnpm db:generate` in `server/` (never hand-edited).

`conventions` changes:

| Column | Type | Notes |
|---|---|---|
| `category` | `text` enum, not null, default `'other'` | see `ConventionCategory` |
| `evidence_line` | `integer` | 1-based, after correction |
| `status` | `text` enum `pending/accepted/rejected`, not null, default `'pending'` | replaces `accepted` |
| `edited` | `boolean` not null default `false` | |
| `created_at`, `updated_at` | `timestamptz` | |
| `accepted` | dropped | nothing writes the table today (seed leaves it empty) |

Index `conventions_repo_status_idx (repo_id, status)`. `repo_id` stays
nullable in the schema but the module always sets it.

`ConventionCategory = 'naming' | 'structure' | 'imports' | 'typing' |
'error-handling' | 'testing' | 'formatting' | 'other'`.

## Contracts (both vendor copies)

```ts
ConventionCandidate = {
  id, repo_id,
  category: ConventionCategory,
  rule: string,
  evidence_path: string, evidence_line: number, evidence_snippet: string,
  confidence: number,            // 0..1
  status: 'pending' | 'accepted' | 'rejected',
  edited: boolean,
  created_at: string,
}
ConventionScanResult = {
  candidates: ConventionCandidate[],     // pending + accepted, after the scan
  samples: string[],                     // files sent to the model
  dropped: { rule: string; reason: 'path_not_sampled' | 'file_missing' | 'snippet_not_found' | 'duplicate' | 'rejected_before' }[],
  model: string,
}
ConventionPatch = { status?: …; rule?: string (1..500); category?: ConventionCategory }
ConventionSkillDraft = { name, description, type: 'convention', body, evidence_files: string[] }
CreateConventionSkill = ConventionSkillDraft & { candidate_ids: string[]; agent_ids: string[]; message?: string }
```

## Endpoints

All workspace-scoped through `getContext`, `404` for a repo outside the
workspace.

| Method | Path | Does |
|---|---|---|
| `POST` | `/repos/:id/conventions/extract` | sample → LLM → verify → store; returns `ConventionScanResult` |
| `GET` | `/repos/:id/conventions` | `pending` + `accepted`, confidence desc |
| `PATCH` | `/conventions/:id` | `ConventionPatch` |
| `POST` | `/repos/:id/conventions/skill-draft` | body `{ candidate_ids }` → `ConventionSkillDraft`; no write |
| `POST` | `/repos/:id/conventions/skill` | `CreateConventionSkill` → created or re-versioned `Skill` |

Errors: `409 repo_not_indexed` when there is no clone or
`getConventionSamples` returns `[]` (message tells the user to index the
repo); `422` when the model output fails the schema after
`parseWithRepair`; `400` when `candidate_ids` contains a non-accepted id.

## Pipeline: `POST /repos/:id/conventions/extract`

1. **Sample** (`sampling.ts`, pure over a file reader):
   - configs from `repo.clonePath`, depth ≤ 2: `eslint.config.*`,
     `.eslintrc*`, `tsconfig*.json`, `.prettierrc*`, `prettier.config.*`,
     `.editorconfig`; skip `node_modules`, `dist`, `vendor`;
   - `repoIntel.getConventionSamples(repoId, 12)`;
   - each file is read, capped at 300 lines / 12 000 chars, and rendered
     with line numbers (`  42 | code`) so the model can cite lines.
2. **Ask** the model (`prompt.ts` holds the system prompt constant):
   schema `ConventionExtraction = { candidates: { category, rule, evidence:
   { path, line, snippet }, confidence }[] }`, max 25 candidates,
   `temperature: 0`. The prompt asks for rules a reviewer could check, one
   code line as snippet copied verbatim, and nothing a linter config shown
   already enforces.
3. **Verify** (`evidence.ts`, pure, unit-tested):
   - `path` normalised (no leading `./`, no `..`) and in the sample set;
   - resolved path stays inside `clonePath`, file readable;
   - snippet compared whitespace-collapsed against lines
     `line-3 … line+3`; first match wins and sets `evidence_line`;
   - confidence clamped to `0..1`.
4. **Dedupe** against kept rows by normalised rule (lowercase, collapse
   whitespace, strip trailing punctuation); a match with a `rejected` row is
   reason `rejected_before`.
5. **Store** in one transaction: delete this repo's `pending` rows, insert
   survivors as `pending`.
6. **Log** through the pino logger: samples count, candidates proposed,
   kept, dropped by reason, model, tokens.

## Skill draft body (`skill-draft.ts`, pure)

```md
Conventions extracted from <owner/name>. Flag code in a PR that breaks one
of them; cite the rule.

## Naming
- <rule> — e.g. `<evidence_path>:<evidence_line>`
## Error handling
- …
```

Categories in `ConventionCategory` order; rules by confidence desc within a
category. Description default: `"Flag code that breaks this repo's extracted
conventions (naming, structure, errors…)."` Must pass `SkillInput` limits
(`MAX_SKILL_BODY_CHARS`).

## Module placement

`server/src/modules/conventions/`: `routes.ts` (thin), `service.ts`,
`repository.ts` (Drizzle only here), `sampling.ts`, `evidence.ts`,
`prompt.ts`, `skill-draft.ts`, `constants.ts`. Registered in
[`modules/index.ts`](../src/modules/index.ts). The service reads files
through `readFile` on `clonePath` as `repo-intel` does; creating the skill
goes through the skills service and linking through the agents service,
never their repositories.

## Tests

- Unit: `sampling` (config globs, caps, line numbering); `evidence` (path not
  sampled, `..` escape, missing file, snippet at exact line, ±3 correction,
  whitespace differences, not found); rule normalisation and dedupe;
  `skill-draft` grouping and order.
- Integration (`*.it.test.ts`, Testcontainers, `MockLLMProvider` with
  `structuredBySchema.ConventionExtraction`, a temp dir as `clonePath`):
  - extract stores only verified candidates and reports the dropped ones;
  - `409` when not indexed;
  - rescan keeps accepted/rejected, replaces pending, suppresses rejected;
  - PATCH accept/reject/edit, workspace isolation;
  - skill create links agents, sets `source: 'extracted'` and
    `evidence_files`; a second create re-versions; a manual skill with the
    same name → `409`;
  - the feature model override is the model sent to the provider.

## Acceptance (criteria in `hw2-criteria.md`)

- [ ] 38 — extract runs analysis and the result survives a server restart.
- [ ] 39 — sampling is configs + `getConventionSamples(…, 12)`, no LLM.
- [ ] 40 — model output is `{ category, rule, evidence: path+line, confidence }`.
- [ ] Candidates without verifiable evidence never reach the list.
- [ ] 42 — accepted candidates become one `repo-conventions` skill linked to an agent.
- [ ] 48 — a rejected candidate does not come back after reload or ReScan
      and is not in the skill.
- [ ] 53 — changing the Conventions model in Settings changes the model used.

## Product improvements (not in this scope)

Ideas for more and better candidates, roughly by value per effort:

1. **Measure prevalence in code, not in the model's opinion.** For each
   candidate, count matches and counter-examples across the repo (ripgrep or
   the existing `astgrep` adapter). Confidence becomes "holds in 47 of 52
   files"; rules broken in most files are dropped.
2. **Stratified sampling.** Top-12 by global rank is dominated by one
   package. Sample per top-level package/layer (`server/`, `client/`, …)
   and attach a path scope to each rule (`applies to server/**`).
3. **Drop what the linter already enforces.** Parse the eslint/prettier
   configs and discard candidates they cover; the skill should hold what
   tooling cannot check.
4. **Mine review history.** Accepted findings and human PR comments that
   repeat ("we always…") are conventions with real evidence of mattering.
5. **Read the repo's own docs** (`AGENTS.md`/`CLAUDE.md`, `CONTRIBUTING`,
   ADRs, `insights.md`) as a second source and mark rules confirmed by both.
6. **Several skills, not one.** Group by category or path scope into
   `repo-naming`, `repo-error-handling`, … so an agent links only what fits
   its focus.
7. **Close the loop.** Show each extracted skill's accept rate from the
   existing skill stats; propose retiring rules whose findings get dismissed.
8. **Drift.** Scheduled rescan diffs against the current skill: new
   conventions, and accepted ones the code no longer follows.
