# Skills (UI)

A Skills page to browse, create, edit, version and import reusable skills,
and a Skills tab in the agent editor to link, toggle and reorder them per
agent.

Server/API spec: [`server/specs/skills.md`](../../server/specs/skills.md). It
covers the data model, endpoints, versioning, stats, import parsing and
prompt injection.

## Decisions

1. **The Skills page is master-detail**, like `/agents`: a card list on the
   left, the selected skill on the right. Routes are `/skills` (nothing
   selected), `/skills/[id]` (detail) and `/skills/new` (empty Config form).
   The detail tab is kept in `?tab=`.
2. **Detail tabs: Config · Preview · Evals · Stats · Versions.** Evals is a
   stub, and "Run on evals" is disabled with a tooltip (server Decision 14).
3. **The agent's Skills tab shows linked skills only.** The checkbox is the
   per-agent `enabled` flag. New skills are added with "+ Link skill".
4. **The agent Skills tab saves immediately.** Every toggle, reorder, link
   and unlink calls `PUT /agents/:id/skills` with an optimistic update and
   rolls back on error. There is no Save button.
5. **Reorder uses `@dnd-kit`** (`core` + `sortable`), a new `client`
   dependency. It gives keyboard (Space + arrows) and screen-reader support.
6. **The body editor is a plain `textarea` with a line-number gutter**, not
   CodeMirror/Monaco. The design only needs a mono editor with line numbers.
7. **Diff uses the `diff` package** (jsdiff, line mode), a new `client`
   dependency, rendered with the existing diff styling tokens.
8. **Token counts are advisory.** In the client they are estimated as
   `ceil(chars / 4)` and shown with "~". The exact count is in the run trace.
   The agent Skills tab warns when enabled skills sum to more than 4,000.
9. **Import always goes through a preview.** Nothing is saved until the user
   clicks Save in the import modal.

## Navigation

- [`vendor/ui/nav.ts`](../src/vendor/ui/nav.ts): add a `SKILLS LAB` section
  with **Skills** (`/skills`, icon `Sparkles`, gKey `s`) and move **Agents**
  into it, matching the design. `activeKeyFor` already handles `/skills`.
- Breadcrumb: `Skills Lab › Skills`.

## `/skills`: list pane (left)

- Header: "Skills" and a **+ Add Skill ▾** `Dropdown` with **Create skill**
  (→ `/skills/new`) and **Import from file…** (→ import modal). URL and
  community import keys already exist in
  [`messages/en/skills.json`](../messages/en/skills.json) but are **not**
  shown.
- "Search skills…" filters by name and description on the client.
- `SkillCard` (selected state as on `AgentCard`):
  - type-colored icon, mono name, enabled `Toggle` (global kill-switch;
    clicking it does not change the selection);
  - one-line clamped description;
  - type chip (rubric = blue, convention = green, security = red, custom =
    neutral) and a source label with an icon: Manual / Extracted / Community
    / Imported;
  - footer from `stats`: `N agents · X% pull · Y% accept`. A `null` rate shows
    as `—`. Accept is colored like on `AgentCard` (green ≥ 70%, amber ≥ 50%,
    otherwise red).
  - A disabled skill is rendered muted (as `phantom-api-gate` in the design).
- Empty state: `EmptyState` with the Create and Import actions. The right
  pane shows the existing `selectPrompt` copy when nothing is selected.

## Detail pane (right)

**Header:** type-colored icon, mono name, type chip, version chip (`v5`), and
on the right a **Run on evals** button (disabled, tooltip "Evals arrive in a
later lesson"). A `⋯` menu next to it has **Delete**, which confirms with
"Used by N agents — it will be unlinked from them."

### Config tab

"Configuration" heading with a version chip and the **Enabled** toggle on the
right. The form is built from the kit (`FormField`, `TextInput`,
`SelectInput`, `Toggle`):

| Field | Control | Notes |
|---|---|---|
| Name * | `TextInput` (mono) | kebab-case slug, inline validation; `409` → "Name already used" |
| Description | `TextInput` | Required. Hint under the field: *"This is the skill's interface — write it as a directive: 'Flag…', 'Check that…'."* |
| Type | `SelectInput` | rubric / convention / security / custom |
| Skill body * | `SkillBodyEditor` | see below |

`SkillBodyEditor`:
- Header bar: file icon, `<name>.md`, an `unsaved` chip when the body is
  dirty, and `~N tokens` on the right.
- A mono `textarea` with a synced line-number gutter, a fixed height with
  internal scroll, and Tab inserting two spaces.

Footer (sticky, as on `ConfigTab`):
- When `used_by > 1`, a banner: "Used by N agents — changes apply to all of
  them."
- When body, description or type changed, a **"What changed?"** `TextInput`
  (optional, ≤ 200 chars, placeholder "Edited") that is sent as `message`.
- **Save skill** / **Cancel**. Save → `PUT`, toast "Saved as v6" when a
  version was created. Cancel resets the form.
- Navigating away with unsaved changes asks for confirmation.

On `/skills/new` the same form is empty, there's no version chip and no
"What changed?" field, and Save → `POST` → redirect to `/skills/[id]`.

Imported skills show a persistent notice above the form: "Imported from
`<file>` — review the instructions: this text goes into your agents'
prompts."

### Preview tab

"Preview" heading and the caption "Rendered as the reviewing agent receives
it." A card renders the **saved** body with the existing `Markdown`
primitive (react-markdown + GFM). If Config has unsaved edits, a note says
the preview shows the saved version.

### Evals tab

`EmptyState`: "Evals for skills arrive in a later lesson." No requests.

### Stats tab

Data from `GET /skills/:id/stats`, 30-day window (caption "Last 30 days ·
runs this skill was part of"):

- Four `MetricCard`s:
  - **Used by**: `N agents`;
  - **Pull frequency**: `X%`;
  - **Accept rate**: `Y%` with a small `CircularScore` ring;
  - **Findings (30d)**: count.

  A `null` value shows as `—`, with a hint ("No runs yet" / "No triaged
  findings").
- **Agents using this skill**: rows with the agent name, a "disabled" tag
  when the per-agent link is off, and an **Open** link to
  `/agents/[id]?tab=skills`.
- **Findings by category**: the `Donut` chart plus a legend of
  `category — count`. The design's `$` values are a mock artifact; we show
  counts.
- A footnote: "Correlation: findings from runs where this skill was in the
  prompt, not findings caused by it."

### Versions tab

"Version history" with a count chip, and the caption "Every save snapshots
the body so eval runs stay reproducible against the exact text they scored."
Rows are newest first:

- `vN` badge, message, date (`YYYY-MM-DD`);
- the current row shows a green **Current** pill;
- other rows have **Diff** and **Restore** actions.
  - **Diff** opens a `Modal` with a line diff of `vN → current` (body, plus
    description/type if they differ).
  - **Restore** asks for confirmation ("Creates v<current+1> with the content
    of vN"). It then calls restore, refreshes the skill and versions, and
    toasts.

## Import modal

`Modal` opened from **Import from file…**:

1. **Pick:** a file input or drop zone that accepts `.md,.zip` and states the
   1 MB limit.
2. **Preview:** `POST /skills/import/preview` returns the draft, shown as:
   - editable Name / Description / Type, and the body in a rendered/raw
     switch;
   - `~N tokens`;
   - **Ignored files** list (`path — reason`), e.g. `scripts/run.sh — script,
     not imported`;
   - warnings, and a name-conflict error that blocks Save until renamed;
   - trust banner (always): *"This skill was written by someone else. Its text
     becomes instructions in your agents' prompts. Scripts and other files
     are never run or stored."*
3. **Save** → `POST /skills` with `source: 'imported_file'` → close and select
   the new skill on the Preview tab. **Cancel** discards the draft. Nothing is
   persisted before Save.

## Agent editor: Skills tab

- [`AgentEditor/constants.ts`](../src/app/agents/[id]/_components/AgentEditor/constants.ts):
  `TABS` += `{ key: "skills", labelKey: "editor.tabs.skills", icon: "Sparkles" }`.
  `AgentEditor` renders by `?tab=`.
- New `_components/SkillsTab/`, matching the agent design:
  - Header: "Skills", a badge "`<enabled>` of `<linked>` enabled", a total
    tokens hint (warning color above 4,000), and "Filter skills…".
  - Caption: "Order matters — earlier skills appear earlier in the assembled
    prompt. Drag to reorder."
  - Rows: drag handle, checkbox (per-agent `enabled`), mono name (links to
    `/skills/[id]`), type chip, and an unlink (×) action on hover. A globally
    disabled skill shows as muted with a "disabled globally" tag and doesn't
    count as enabled.
  - Drag is disabled while the filter is non-empty (reordering a filtered
    subset is ambiguous).
  - **+ Link skill**: a `SearchableSelect` of workspace skills not yet linked,
    which appends to the end.
- `AgentCard` gets `skillCount` from `agent.skill_count`.

## Component placement

Following `frontend-ui-architecture` and the `app/agents/` shape:

```
app/skills/page.tsx                      list + "select a skill"
app/skills/[id]/page.tsx                 list + detail ("new" handled here)
app/skills/_components/SkillsListView/   (+ _components/ImportSkillModal)
app/skills/_components/SkillCard/
app/skills/[id]/_components/SkillDetail/
    _components/ConfigTab/  (+ SkillBodyEditor)
    _components/PreviewTab/
    _components/EvalsTab/
    _components/StatsTab/
    _components/VersionsTab/ (+ VersionDiffModal)
app/agents/[id]/_components/AgentEditor/_components/SkillsTab/
```

## Data hooks: `src/lib/hooks/skills.ts`

`useSkills`, `useSkill(id)`, `useCreateSkill`, `useUpdateSkill`,
`useDeleteSkill`, `useSkillVersions(id)`, `useSkillVersion(id, v)`,
`useRestoreSkillVersion`, `useSkillStats(id)`, `useImportSkillPreview`
(multipart), `useAgentSkills(agentId)`, `useSetAgentSkills(agentId)`
(optimistic).

All of them invalidate `["skills"]`, `["skill", id]`,
`["skill-versions", id]`, `["skill-stats", id]`,
`["agent-skills", agentId]` and `["agents"]` as relevant. `lib/api.ts` gets a
`postForm` helper that does **not** set `Content-Type: application/json`.

## Run trace

`TraceBody` already renders the Skills `PromptBlock`. Add a compact list from
`trace.skills_applied` under it (`name v5 · 410 tok`, `imported` badge when
applicable) so the block and the added tokens are visible together.

## Tests (Vitest + RTL)

- `SkillCard`: stats footer formatting, `—` for null rates, the toggle doesn't
  change the selection, the muted state when disabled.
- Config tab:
  - slug validation;
  - a `409` maps to a field error;
  - the `unsaved` chip appears on edit;
  - "What changed?" shows only on content change and is sent as `message`.
- `SkillBodyEditor`: the gutter line count follows the text.
- Versions tab: Current has no actions, Restore confirms and calls the
  mutation, Diff renders added/removed lines.
- Stats tab: null metrics render `—` with a hint, and the agent rows link to
  the agent's Skills tab.
- `SkillsTab`: renders the linked skills in order, the checkbox calls the
  mutation with the new set, a keyboard reorder changes the order, the badge
  count excludes globally disabled skills, and a failed mutation rolls back.
- Import modal: Save is disabled until the preview loads; nothing is posted to
  `/skills` on Cancel; ignored files and the trust banner are rendered; a name
  conflict blocks Save.

## e2e (deterministic, no LLM): `e2e/specs/08-skills.flow.json`

1. Create a skill.
2. Edit its body with a message → Versions shows v2 with the message.
3. Restore v1 → v3 is current.
4. Link the skill to Test Quality Reviewer, then toggle and reorder it.
5. Import `flaky-tests.zip` through the preview and assert `scripts/` is
   listed as ignored.
6. The saved skill appears in the list.

## i18n

Extend the existing [`messages/en/skills.json`](../messages/en/skills.json)
(`page`, `detail` and `drawer` keys are already there). Add `tabs`, `config`,
`preview`, `evals`, `stats`, `versions`, `import`, `card`. Add
`agents.editor.tabs.skills` and `agents.skills.*` to `agents.json`.
