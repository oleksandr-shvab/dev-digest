# API Contract Reviewer

An agent that flags API contract problems in a PR: breaking changes,
response-shape changes, missing major bumps and silent removals. It is built
entirely with the existing Agents and Skills features — **no new server
code**. This spec fixes its prompt, its four skills and the control
experiment that proves the skills matter.

Mechanisms used: [`skills.md`](skills.md) (skills, import, prompt injection,
run trace) and the agent editor's Skills tab
([`client/specs/skills.md`](../../client/specs/skills.md)).

## Decisions

1. **Created through the UI, not seeded.** The agent and three skills are
   created in the Agents / Skills pages; `deprecation-policy` is imported
   from a `.zip` (criterion 16). The texts are kept as files in the repo so
   they are reviewable and reproducible, but the DB copy is what runs.
2. **Source files live next to the other agent prompts:**
   - `docs/agent-prompts/api-contract-reviewer.md` — system prompt;
   - `docs/agent-prompts/skills/api-contract/<name>/SKILL.md` — one per skill,
     frontmatter `name` + `description`, body below;
   - `docs/agent-prompts/fixtures/deprecation-policy.zip` — the import
     fixture (`SKILL.md` at the root).
3. **All four skills are `type: 'rubric'`.** Each has a directive
   description ("Flag…") and a **Good / Bad** example pair (criterion 43).
4. **The system prompt stays generic on purpose.** It names the focus (public
   API contracts) but not the rules, so the run without skills is a fair
   baseline.

## Agent

| Field | Value |
|---|---|
| Name | API Contract Reviewer |
| Description | Flags changes that break or silently alter a public API contract. |
| Provider / model | the workspace's usual review model |
| Strategy | single-pass |
| System prompt | `docs/agent-prompts/api-contract-reviewer.md`: role, what counts as a public contract (HTTP routes, request/response schemas, exported types of shared contracts, events), the severity/verdict conventions every reviewer prompt follows, cite `file:line` |

## Skills (linked in this order)

| # | Name | Flags | Good / Bad example |
|---|---|---|---|
| 1 | `breaking-change` | removed or renamed route, method, param, required request field; narrowed accepted values | Bad: `GET /pulls/:id` → `/pull-requests/:id` with no alias. Good: new route added, old one kept and marked deprecated. |
| 2 | `response-schema` | removed/renamed response field, type change, optional → required on input, required → optional/nullable on output | Bad: `score: number` → `score: string`. Good: add `score_label` next to unchanged `score`. |
| 3 | `semver-discipline` | a breaking change without a major bump (package version, API version prefix, or changelog entry) | Bad: field removed in `1.4.0 → 1.5.0`. Good: same change ships as `2.0.0` with a migration note. |
| 4 | `deprecation-policy` (imported) | silent removal; deprecation without a replacement, date or header | Bad: field deleted. Good: field kept, `@deprecated use X, removed in v3` in the schema, `Deprecation` header on the route. |

Each skill body: one-paragraph directive, a checklist of what to flag, the
Good / Bad pair as code, and "Do not flag" (additive changes, internal-only
modules).

## Control experiment (criterion 18)

On the demo repo already imported in DevDigest:

1. Open a PR that renames a response field of an existing route (e.g.
   `created_at` → `createdAt`) and changes one route param, with no version
   bump and no deprecation.
2. Run **API Contract Reviewer** with all four skills disabled on its Skills
   tab. Expected: the rename is missed or only mentioned as style.
3. Enable the skills, re-run. Expected: a breaking-change finding on the
   rename and the param, citing `file:line`, plus semver and deprecation
   findings.
4. Open both run traces: the Skills block with its token count is present
   in (3) and absent in (2) (criteria 19, 20).

Record run ids and findings under **Results**.

## Acceptance

- [ ] 43 — the four skills exist, each with a directive description and a
      Good / Bad example.
- [ ] 16 — `deprecation-policy` shows source "Imported".
- [ ] 18 — the experiment reproduces (Results below).

## Results

_To be filled after the control experiment._
