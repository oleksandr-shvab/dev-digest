# Skills

Reusable, text-only review instructions that can be linked to any number of
agents. The DB is the source of truth. A skill is created or edited in the UI,
or imported from a `.md` / `.zip` file, and its body is injected into the
agent's prompt as a separate block, in the order set per agent. Every content
save is a restorable version, and each run records which skill versions it
used, which drives the per-skill stats.

Companion UI spec: [`client/specs/skills.md`](../../client/specs/skills.md).

## Background

Most of the foundation already exists and is reused:

- Schema: `skills`, `skill_versions`
  ([`schema/skills.ts`](../src/db/schema/skills.ts)) and the `agent_skills`
  link table with `order` ([`schema/agents.ts`](../src/db/schema/agents.ts)),
  all created in migration `0000`.
- Contracts: `Skill`, `SkillType`, `SkillSource` in
  [`vendor/shared/contracts/knowledge.ts`](../src/vendor/shared/contracts/knowledge.ts).
- Agent side of the link: `GET/POST /agents/:id/skills`,
  `AgentsRepository.linkedSkills/setSkills/linkSkill`
  ([`modules/agents/`](../src/modules/agents/)).
- Engine: `reviewPullRequest({ skills: string[] })` →
  `assemblePrompt` renders `## Skills / rules` and records
  `prompt_assembly.skills` in the trace
  ([`reviewer-core/src/prompt.ts`](../../reviewer-core/src/prompt.ts)).
- Stats inputs: `findings.category`, `findings.accepted_at/dismissed_at`,
  `findings.review_id → reviews.run_id → agent_runs`
  ([`schema/reviews.ts`](../src/db/schema/reviews.ts),
  [`schema/runs.ts`](../src/db/schema/runs.ts)).
- `eval_cases` already supports `owner_kind = 'skill'`
  ([`schema/eval.ts`](../src/db/schema/eval.ts)) but there is no eval module.
  Evals are **out of scope** here (see Decisions).

The gap: there is no `skills` module (no CRUD, versions, import or stats), and
[`run-executor.ts`](../src/modules/reviews/run-executor.ts) never passes
`skills` to `reviewPullRequest`, so the block is always empty today.

## Decisions

1. **Skills are text only.** A skill is `name + description + type + body`.
   It has no tools, no scripts, no file references. Nothing from a skill is
   ever executed.
2. **Two enable levels.** `skills.enabled` is a global kill-switch (toggle on
   the skill card and in Config). `agent_skills.enabled` turns a *linked*
   skill on/off for one agent without losing its position. A skill reaches
   the prompt only when both are true.
3. **Order is per agent** (`agent_skills.order ASC`) and is the order of the
   blocks in the prompt.
4. **Import is two-step.** `POST /skills/import/preview` parses and returns a
   draft — it never writes to the DB. The draft is persisted only by a
   regular `POST /skills` after the user confirms in the UI.
5. **Import accepts `.md` and `.zip` only.** From a zip, only `SKILL.md` is
   used (frontmatter → `name`/`description`, rest → `body`). Every other
   entry (`scripts/`, `references/`, binaries) is reported back as `ignored`
   and discarded. The archive is read in memory; nothing is written to disk
   and nothing is executed.
6. **Versions snapshot prompt-affecting content.** Changing `body`,
   `description` or `type` bumps `skills.version` and snapshots all three plus
   a `message` into `skill_versions`. Renaming or toggling `enabled` does not
   create a version.
7. **Version message comes from the user.** An optional `message` is sent with
   the save. Defaults: `"Initial version"` for manual v1,
   `"Imported from <file>"` for imported v1, `"Edited"` otherwise.
8. **Restore creates a new version.** Restoring vN copies its
   body/description/type into version `current+1` with the message
   `"Restored from vN"`. History is never rewritten or deleted.
9. **Link changes version the agent.** Link / unlink / per-agent toggle /
   reorder bumps `agents.version`, and the `agent_versions.config_json.skills`
   snapshot becomes `[{ skill_id, version, enabled }]` (was `string[]`) so a
   run is reproducible.
10. **Runs record applied skills in a table.** `run_skills(run_id, skill_id,
    skill_version, tokens)` is written for every run that had skills in the
    prompt. Stats query this table, not the trace JSON.
11. **Stats are correlation, not attribution.** A finding is not tied to the
    skill that "caused" it. Skill stats describe the runs a skill took part
    in. The UI labels them that way.
12. **Token budget is advisory.** No hard limit on the skills block. The
    server only enforces a defensive max body size; the UI shows counts and
    warns (see client spec).
13. **Imported skills are not wrapped in `<untrusted>`.** Wrapping would stop
    them working as instructions. Trust is handled by mandatory preview +
    confirmation, a visible `source`, provenance in the trace, and the
    `INJECTION_GUARD` staying last in the system prompt.
14. **Evals are out of scope.** The Evals tab and "Run on evals" are UI stubs.
    No eval endpoints are added here.

## Data model

One migration, generated via `pnpm db:generate` (never hand-written):

```
agent_skills
  + enabled        boolean NOT NULL DEFAULT true

skills
  + updated_at     timestamptz NOT NULL DEFAULT now()
  + UNIQUE (workspace_id, name)
  ~ source enum += 'imported_file'

skill_versions
  + description    text NOT NULL DEFAULT ''
  + type           text NOT NULL DEFAULT 'custom'   -- SkillType
  + message        text NOT NULL DEFAULT ''

run_skills                                           -- new
  run_id           uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE
  skill_id         uuid NOT NULL REFERENCES skills(id)     ON DELETE CASCADE
  skill_version    integer NOT NULL
  tokens           integer NOT NULL
  PRIMARY KEY (run_id, skill_id)
  INDEX (skill_id)
```

- `name` is a kebab-case slug (`^[a-z0-9]+(-[a-z0-9]+)*$`, ≤ 64 chars), e.g.
  `uncovered-branches`. Unique per workspace.
- `source` values in the UI: `manual` → "Manual", `extracted` → "Extracted",
  `community` → "Community", `imported_file` / `imported_url` → "Imported".
  This feature only writes `manual` and `imported_file`.
- The existing `skill_versions` rows (none in practice) get defaults from the
  migration.
- Deleting a skill cascades its links, versions and `run_skills` rows. The
  runs and their traces are kept.

Contracts change in **both** vendored copies (`server/src/vendor/shared` and
`client/src/vendor/shared`):

- `SkillSource` += `'imported_file'`.
- `Skill` += `updated_at`, and on list/detail reads `stats: SkillStatsSummary`.
- New `SkillInput`, `SkillVersion`, `SkillStats`, `SkillImportDraft`,
  `AgentSkill` (below).
- `Agent` += `skill_count`.
- `RunTrace` += optional `skills_applied` (see Pipeline).

## API — `server/src/modules/skills/`

Same layering as `agents`: `routes.ts` (thin, Zod, `getContext()`) →
`service.ts` → `repository.ts`, pure logic in `helpers.ts`, `stats.ts` and
`import/parse.ts`. Registered in `modules/index.ts`.

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/skills` | Workspace skills, name ASC, each with `stats` summary (card footer) |
| `GET` | `/skills/:id` | One skill + `stats` summary |
| `POST` | `/skills` | Create. Body `SkillInput`. Writes v1. `201` |
| `PUT` | `/skills/:id` | Partial update + optional `message`; versions per Decisions 6–7 |
| `DELETE` | `/skills/:id` | Delete; links cascade |
| `GET` | `/skills/:id/versions` | `SkillVersion[]`, newest first |
| `GET` | `/skills/:id/versions/:version` | One snapshot (for Diff) |
| `POST` | `/skills/:id/versions/:version/restore` | Decision 8. Returns the updated `Skill` |
| `GET` | `/skills/:id/stats` | `SkillStats` (Stats tab) |
| `POST` | `/skills/import/preview` | Multipart, one file field → `SkillImportDraft`. No DB write |

```ts
SkillInput = {
  name: slug, description: string (1..500), type: SkillType,
  body: string (1..MAX_SKILL_BODY_CHARS), enabled?: boolean,
  source?: 'manual' | 'imported_file',
  message?: string (≤ 200),          // PUT only; used when a version is created
}

SkillVersion = {
  version: number, message: string, created_at: string,
  body: string, description: string, type: SkillType,
  current: boolean,
}

SkillStatsSummary = {                // card footer, 30-day window
  used_by: number,                   // agents linking it (any enabled state)
  pull_rate: number | null,          // 0..1
  accept_rate: number | null,        // 0..1
}

SkillStats = SkillStatsSummary & {
  window_days: 30,
  findings: number,                  // findings in runs that applied the skill
  agents: { id: string, name: string, enabled: boolean }[],
  by_category: { category: string, count: number }[],   // desc by count
}

SkillImportDraft = {
  name: string, description: string, type: SkillType /* default 'custom' */,
  body: string, tokens: number,
  file: { name: string, kind: 'md' | 'zip' },
  ignored: { path: string, reason: 'script' | 'binary' | 'non-skill-file' }[],
  warnings: string[],   // e.g. "name was normalized", "no frontmatter"
  name_conflict: boolean,
}
```

Errors (central handler): `409` on duplicate name, `413` over size limits,
`422` for an unparseable file or a zip without `SKILL.md`, `404` for an
unknown version.

Agent side (in `modules/agents`):

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/agents/:id/skills` | `AgentSkill[]` in order: `{ skill: Skill, order, enabled }` |
| `PUT` | `/agents/:id/skills` | Body `{ items: [{ skill_id, enabled }] }` — full ordered set, replaces links in **one transaction**, bumps agent version (Decision 9). Unknown / other-workspace `skill_id` → `422` |

The existing `POST /agents/:id/skills` is kept for compatibility but now also
runs in a transaction and bumps the version.

`GET /agents` gains `skill_count` (enabled links whose skill is enabled) for
the agent card.

### Stats definitions (`stats.ts`)

All figures use a **30-day window** on `agent_runs.created_at` and only runs
with `status = 'done'`.

- **used_by**: count of `agent_skills` rows for the skill.
- **pull_rate**: runs that applied the skill (`run_skills`), divided by all
  runs of the agents that currently link it. `null` when the denominator is 0.
- **findings**: count of `findings` joined through
  `reviews.run_id ∈ runs that applied the skill`.
- **accept_rate**: `accepted / (accepted + dismissed)` over those findings.
  `null` when nothing was triaged.
- **by_category**: those findings grouped by `findings.category`.

The list endpoint computes the summary for all skills with grouped queries
(no per-skill N+1). The SQL lives in the repository; `stats.ts` holds only
the pure ratio/`null` rules and is unit-tested.

### Import parser (`modules/skills/import/parse.ts`)

Pure function `(filename, bytes) → SkillImportDraft`, no I/O, unit-tested.

- `.md`: optional YAML frontmatter (`name`, `description`; anything else
  ignored) + markdown body. If `name` is missing, use the first `#` heading,
  then the file name, slugified.
- `.zip`: unpacked **in memory** (`fflate`). Only `SKILL.md` is inflated, found
  at the root or in a single top-level folder; otherwise `422`. All other
  entries go to `ignored` with a reason.
- Limits (`constants.ts`): upload ≤ 1 MB, ≤ 200 entries, total uncompressed ≤
  5 MB (zip-bomb guard, checked from headers *before* inflating), body ≤
  `MAX_SKILL_BODY_CHARS` (40k chars).
- Never writes to the filesystem, never touches `child_process`, never follows
  symlink entries.

## Review pipeline

In [`run-executor.ts`](../src/modules/reviews/run-executor.ts), before
`reviewPullRequest`:

1. Load the agent's links joined to skills, keep
   `skills.enabled && agent_skills.enabled`, order by `agent_skills.order`.
2. Format each as a block (helper, unit-tested):
   ```
   ### <name> (v<version>)
   <description>

   <body>
   ```
3. Pass `skills: blocks` to `reviewPullRequest` (omitted when empty, so the
   prompt stays identical to today for agents with no skills).
4. Log through `runLog`:
   `Skills: 3 active · ~1.2k tokens` then one line per skill
   `  pr-quality-rubric v5 · 410 tokens`. Disabled skills are **not** logged
   and not in the prompt.
5. Persist: insert `run_skills` rows inside `persistRunOutcome`'s transaction.
   Failed or cancelled runs write no rows, so they don't count in stats.
6. Trace: `RunTrace.skills_applied = [{ id, name, version, source, tokens }]`.
   Tokens come from the existing `tokenizer` adapter.
   `prompt_assembly.skills` already holds the full block text.

`reviewer-core` logic is unchanged. Only the `skills` doc comment in
`prompt.ts` is updated to describe the trust model in Decision 13. No I/O is
added there.

## Seed: Test Quality Reviewer

- Prompt: `TEST_QUALITY_REVIEWER_PROMPT` in `seed-prompts.ts` plus the md copy
  `docs/agent-prompts/test-quality-reviewer.md`, like the existing agents.
- Agent: **Test Quality Reviewer**. It checks test quality: uncovered
  branches, missed corner cases, over-mocking, flaky tests.
- Four skills, all `type: 'rubric'`, linked in this order:
  1. `uncovered-branches`
  2. `corner-cases`
  3. `over-mocking`
  4. `flaky-tests`: **not seeded**. It is imported through the UI from a
     `.zip` (`SKILL.md` + a `scripts/` file) to exercise the full import path
     and show the script is ignored. The zip lives in
     `docs/agent-prompts/fixtures/flaky-tests.zip` (plus its unpacked source).
- Seeded skills get v1 with the message `"Initial version"`.
- The seed is idempotent (upsert by `(workspace_id, name)`).

## Control experiment

On the user's demo repo (already imported in DevDigest):

1. Open a PR that adds a function with a branch plus a test covering only the
   happy path.
2. Run **Test Quality Reviewer** with all its skills disabled on the Skills
   tab. Expected: the gap is missed or only vaguely mentioned.
3. Enable the skills, re-run. Expected: findings for the uncovered branch and
   the boundary case, citing `file:line`.
4. Open the run trace → Prompt assembly: the Skills block and
   `skills_applied` token counts are visible in (3) and absent in (2).
5. The skill's Stats tab now shows pull and findings counts from run (3) only.

Record both run ids and findings under **Results** below.

## Repo tooling: `pr-self-review`

`.claude/skills/pr-self-review/SKILL.md` gets
`disable-model-invocation: true` in its frontmatter. Before opening the PR,
invoke `/pr-self-review` manually and confirm its routing picked both frontend
skills (react / next / frontend-ui-architecture / react-testing-library) and
backend skills (onion-architecture / fastify / drizzle / postgres).

## Tests

- Unit: `import/parse` (md with/without frontmatter, zip with root and
  nested `SKILL.md`, zip without it, scripts-only zip, zip-bomb headers, size
  limits); skill-block formatter; version-bump rules; default version
  messages; `stats.ts` ratio and `null` rules.
- `reviewer-core`: `assemblePrompt` with/without skills (empty → no section).
- Integration (Testcontainers `*.it.test.ts`):
  - skills CRUD + `409`;
  - version snapshots with message; restore creates `current+1` with the old
    content;
  - `PUT /agents/:id/skills` transaction + agent version bump;
  - workspace isolation;
  - run-executor passes only enabled skills in order and writes `run_skills`;
    a failed run writes none;
  - stats: pull/accept/by-category on a fixture of runs and triaged findings,
    and the 30-day window cut-off.

## Acceptance

- [ ] A skill is created and edited in the UI; editing the body bumps its
      version with a message.
- [ ] Restoring an old version creates a new current version and keeps the
      history.
- [ ] Test Quality Reviewer has its four skills linked.
- [ ] An enabled skill appears as its own block in the run log and trace, and
      a disabled one does not.
- [ ] Stats show used-by, pull rate, accept rate, findings and categories
      from real runs.
- [ ] Import went through the preview. The `scripts/` entry was listed as
      ignored and never executed or stored.
- [ ] The control experiment reproduces (Results below).
- [ ] `pr-self-review` has auto-invocation disabled, was run manually, and
      pulled both frontend and backend skills.

## Results

_To be filled after the control experiment._
