# Conventions (UI)

A Conventions page in Skills Lab: scan the active repo, triage the proposed
conventions (Accept / Reject / Edit inline), and turn the accepted ones into a
skill through an editable Create-skill modal.

Server/API spec: [`server/specs/conventions.md`](../../server/specs/conventions.md).
It covers sampling, the model call, evidence checking, endpoints and the
skill draft.

## Decisions

1. **Route `/repos/[repoId]/conventions`.** Conventions are per repo;
   `activeKeyFor` already maps any path containing `/conventions`.
2. **Two buttons** (criterion 45): **Run Scan** in the empty state (no
   candidates yet) and **ReScan** in the header once any exist. Both call
   `POST /repos/:id/conventions/extract`.
3. **Rejected cards disappear** from the list at once and are not returned by
   `GET` after reload. There is no "show rejected" view in this scope.
4. **Edit is inline** (criterion 49): the card turns into a form in place.
5. **Create skill is enabled only with ≥ 1 accepted** candidate
   (criterion 50) and opens a modal fed by the server's draft endpoint.
6. **The modal edits body and metadata** (criteria 41, 51) and reuses the
   existing `SkillBodyEditor` from the skill Config tab.

## Navigation

[`vendor/ui/nav.ts`](../src/vendor/ui/nav.ts): add to the `SKILLS LAB`
section, after Agents: `{ key: "conventions", label: "Conventions", icon:
"ListChecks", href: "/repos/:repoId/conventions" }` (criterion 44).
Breadcrumb `Skills Lab › Conventions` (keys already in
[`messages/en/conventions.json`](../messages/en/conventions.json)).

## Page

Header: "Conventions in `<owner/name>`", subtitle (existing key), the count
line `N candidates · grounded against sampled files`, and on the right
**ReScan** and **Create skill (N accepted)**.

- While a scan runs: both buttons disabled, `Scanning…` state; the list stays
  visible during ReScan.
- After a scan: a toast `Kept K of P candidates · D dropped (no evidence)`
  from `ConventionScanResult`. `409 repo_not_indexed` shows an inline error
  with the server's message.
- Filter chips: **All · Pending · Accepted**, with counts.

Empty state (`EmptyState`): existing `empty.*` copy, CTA **Run Scan**.

## Candidate card

Criteria 46, 47:

- category chip, rule text, confidence as `NN%` (colour: ≥ 80 green, ≥ 50
  amber, otherwise red);
- evidence: mono `path:line` plus the snippet line in a code block;
- `edited` tag when the rule was changed;
- actions: **Accept**, **Reject**, **Edit**. An accepted card shows an
  `Accepted` pill and **Undo** (→ `pending`) instead of Accept.

Inline edit: `textarea` for the rule and a `SelectInput` for the category;
**Save** → `PATCH /conventions/:id`, **Cancel** restores. Evidence is shown
read-only.

Accept / Reject / Undo are optimistic, with rollback and a toast on error.

## Create-skill modal

Opened by **Create skill**. On open it calls
`POST /repos/:id/conventions/skill-draft` with the accepted ids.

- Explainer: "Creates one skill from the N conventions you accepted. Its text
  is injected into the prompts of the agents you link it to."
- Fields: **Name** (default `repo-conventions`, slug validation as in
  Config), **Description**, **Type** (shown, fixed `convention`),
  **Skill body** (`SkillBodyEditor`, `~N tokens`), **Link to agents**
  (multi-select of workspace agents, optional).
- When a skill with that name already exists as `extracted`: note "Saves as
  a new version of `repo-conventions`." A `409` shows as a Name field error.
- **Cancel** discards; **Create** → `POST /repos/:id/conventions/skill` →
  close, toast with a link to `/skills/[id]`. The skill then appears on the
  Skills page (criterion 52).

## Component placement

```
app/repos/[repoId]/conventions/page.tsx
app/repos/[repoId]/conventions/_components/ConventionsView/
    _components/ConventionCard/
    _components/CreateConventionSkillModal/
```

`SkillBodyEditor` is currently under
`app/skills/[id]/_components/SkillDetail/_components/ConfigTab/_components/`.
A second user promotes it to `src/components/skill-body-editor/` (per
`frontend-ui-architecture`), moved without changes.

## Data hooks: `src/lib/hooks/conventions.ts`

`useConventions(repoId)`, `useExtractConventions(repoId)`,
`useUpdateConvention(repoId)` (optimistic), `useConventionSkillDraft(repoId)`,
`useCreateConventionSkill(repoId)`. Invalidate `["conventions", repoId]`;
skill creation also invalidates `["skills"]`, `["agents"]` and
`["agent-skills", agentId]` for each linked agent.

Types: import types only from `@devdigest/shared` (see `client/insights.md`,
2026-09-25); the contracts are updated in both vendor copies.

## i18n

Extend `messages/en/conventions.json`: rename `runExtraction` / `rescan`
values to **Run Scan** / **ReScan**, replace `card.acceptAsSkill` with
`accept` / `reject` / `edit` / `undo` / `save` / `cancel`, add `filters`,
`categories`, `scanResult`, `createSkill.*`. The sidebar label is a literal
in `nav.ts`, like the other items.

## Tests (Vitest + RTL)

- Card: confidence formatting and colour; Accept / Reject / Undo call the
  mutation with the right status; Reject removes the card; Edit is inline,
  Save sends `rule`/`category`, Cancel restores.
- Page: Run Scan only in empty state, ReScan only with candidates; Create
  skill hidden with 0 accepted; scan toast counts.
- Modal: loads the draft; body and metadata are editable and sent; Create is
  disabled while the name is invalid; `409` maps to the Name field; Cancel
  posts nothing.

## e2e: `e2e/specs/09-conventions.flow.json`

Deterministic, no LLM: the flow seeds candidate rows instead of scanning.
Accept two, reject one, edit one inline, reload (the rejected one stays
gone), Create skill with an edited body, then find it on `/skills`.

## Acceptance (criteria in `hw2-criteria.md`)

- [ ] 41, 51 — modal explains the source, edits Name/Description/body, has
      Cancel and Create.
- [ ] 44 — Conventions is in SKILLS LAB.
- [ ] 45 — Run Scan and ReScan are separate buttons.
- [ ] 46, 47 — cards show rule, source file, confidence %, Accept/Reject/Edit.
- [ ] 48 — a rejected card stays gone after reload.
- [ ] 49 — Edit works in place.
- [ ] 50 — Create skill appears after the first Accept.
- [ ] 52 — the created skill is on the Skills page.
- [ ] 53 — Settings → Feature Models has a Conventions row with a
      searchable model dropdown (already present; verify only).
