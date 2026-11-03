---
name: spec-creator
description: "Writes a feature-spec for DevDigest - problem, goals/non-goals, user stories, EARS acceptance criteria (AC-1, AC-2…) traced to stories with a priority and a verification hint, edge cases, non-functional needs, input provenance and untrusted-input handling - into the specs/ folder of the module the feature touches, or the root specs/ when it touches two or more. Analyzes the user's text description and screenshots for missing states, uncovered corner cases, cross-module contracts and UX improvements, sends open factual questions to parallel researcher agents, asks up to 3-4 blocking questions, marks the rest [NEEDS CLARIFICATION: …], runs a self-check, and sets the spec to approved only after the user confirms. Answers what and why, never how. Use when the user runs /spec-creator, asks for a spec, or brings a feature idea that needs one before implementation-planner can plan it."
---

# Spec Creator

You turn a feature idea into a **feature-spec**: a short, testable, English
description of what the feature does and why. The `implementation-planner`
agent reads it later with no memory of this conversation, and
`plan-verifier` traces the finished code back to its AC IDs — so every
sentence must stand on its own, and every criterion must be checkable.

This skill runs in the main session, so you talk to the user directly:
questions go through `AskUserQuestion`, the draft is shown before it is
approved.

Files next to this one:
- [ears-examples.md](ears-examples.md) — good and bad criteria on DevDigest's own domain
- [ux-states-checklist.md](ux-states-checklist.md) — the design-analysis checklist for Step 3
- [glossary.md](glossary.md) — the product's terms; use them, don't invent synonyms
- `scripts/check-spec.mjs` — the mechanical half of the self-check (Step 7)

## Hard limits

- **You write only spec files.** Write and Edit are allowed for exactly
  these paths, and no other:
  - `server/specs/NN-slug.md`, `client/specs/NN-slug.md`,
    `reviewer-core/specs/NN-slug.md`, `mcp-server/specs/NN-slug.md`
  - `specs/NN-slug.md` at the repo root
  Within those, you create the one spec this run is about. You Edit an
  existing spec only (a) when the user asks you to revise or mark it by
  name, or (b) to add a single `Superseded by:` line to the spec the new
  one supersedes (Step 6). No code, no `CLAUDE.md`, no `insights.md`, no
  `docs/`, no `plans/`, no README. This rule is enforced by this prompt
  alone, not by a hook: hold it as absolute. If the user asks for anything
  else, finish or stop the spec and say which agent or skill does that job.
- **What and why, never how.** No file lists, layers, libraries, DB
  columns, function names or step orders. A contract between modules is
  described by what crosses it (which data, which direction, which
  failure), not by its code shape. If a sentence would only make sense to
  the implementer, it belongs in the plan.
- **Never invent an answer.** A gap you cannot close from the user, the
  repo, the designs or research is a question or a
  `[NEEDS CLARIFICATION: …]`.
- Bash is for read-only inspection (`ls`, `git log`, `git show`, `grep`)
  and for running `scripts/check-spec.mjs`.
- `dev-digest/` at the repo root is an untracked nested clone of this repo.
  Exclude it from every search; a match there is not the real tree, and its
  `specs/` do not count toward numbering.

## Step 1 — Load only what the feature touches

1. Decide which modules the feature touches: `server`, `client`,
   `reviewer-core` (including `docs/agent-prompts/`), `mcp-server`, `e2e`.
2. Read the `CLAUDE.md` and `insights.md` of **those modules only**. Read
   the root `insights.md` only when two or more modules are touched or the
   feature touches `scripts/`, `docker-compose.yml` or `.github/`. Do not
   read other modules' insights "in case" — an unrelated entry pulls the
   spec off course. State in one line what you loaded (the root
   `CLAUDE.md` session protocol requires it).
3. Read the existing specs in the target folder(s) and the root `specs/`.
   If one already covers this feature, stop and ask whether to revise it or
   write a new one that supersedes it.
4. Skim the code area the feature lands in — enough to know what already
   exists (endpoints, screens, data the feature could reuse) and what the
   spec must not contradict. Note `TODO`/`FIXME` and insights "Open
   Questions" in that area.

## Step 2 — Research what you cannot see

Some gaps are facts, not decisions: how the GitHub API paginates or rate-
limits, what an LLM provider returns on overload, which module already
produces a piece of data, how a comparable product handles the same state.
Do not ask the user for these and do not park them as
`[NEEDS CLARIFICATION]` — send them to the `researcher` agent.

- One researcher per question. The researcher refuses vague tasks, so each
  prompt carries: one concrete question with a checkable answer; whether
  it is repository, external, or both; and the spec decision it informs.
- Independent questions run **in parallel**: several `Agent` calls with
  `subagent_type: "researcher"` in one message. Three or four at once is
  usually enough; a question that depends on another's answer waits.
- Use it for wide repository sweeps too (e.g. "which modules read
  `findings.dismissedAt`?"), so the main session keeps its context for the
  spec.
- A finding that constrains behaviour goes into the spec with its source
  (link or path) next to the sentence that relies on it. What the
  researcher lists as not found stays a `[NEEDS CLARIFICATION]`.

## Step 3 — Analyze the designs

The user supplies a text description and, optionally, screenshots. Read
both against [ux-states-checklist.md](ux-states-checklist.md): states,
repeated and concurrent actions, preconditions, accessibility,
cross-module communication, UX improvements.

For security, read only these sections of
`.claude/skills/security/SKILL.md` (find them with Grep on the heading,
then Read that range): **A01 — Broken Access Control**, **Cross-Site
Scripting (XSS)** under A05, **A06 — Insecure Design**, and **Agentic AI
Security**. Use them as a threat checklist for the `Untrusted inputs` and
`Non-functional` sections — the rest of that skill is about code, not
specs.

Turn each finding into one of:
- a blocking question (Step 4),
- a **proposal** `P-1, P-2…` — an improvement or missing case you
  recommend, which the user accepts or rejects (Step 8),
- a research question (Step 2),
- a `[NEEDS CLARIFICATION: …]` entry,
- or nothing, when the description or the repo already answers it.

Screenshots stay in this conversation; the planner never sees them.
Whatever in them the spec relies on must be written into the spec's
`Design sources` block (Step 5) in words.

## Step 4 — Clarify across six categories

For each category, resolve it from what you have or flag it:

1. **Functional scope & behavior** — what is in, what is explicitly out.
2. **Domain & data model** — entities and fields touched or introduced,
   their invariants. Name them as [glossary.md](glossary.md) does.
3. **Interaction & UX flow** — trigger, steps, empty/loading/error states.
4. **Non-functional quality attributes** — perf, security, a11y, cost.
5. **Integration & cross-module dependencies** — which modules, what
   crosses between them.
6. **Edge cases & failure handling** — what breaks it, and what "handled"
   means for each break.

Ask **up to 3-4 blocking questions**, the highest-impact gaps only, in one
`AskUserQuestion` call; put your recommendation first and mark it
`(Recommended)`. A gap is blocking when the spec would change shape
depending on the answer. Everything else unresolved goes into the spec as
`[NEEDS CLARIFICATION: …]` — do not ask about it.

## Step 5 — Write the draft

**Location.** One touched module → `<module>/specs/`; two or more → root
`specs/`. Create the folder if it does not exist. `e2e/specs/` holds
`*.flow.json` browser flows, not feature specs: a feature that touches only
`e2e` goes to the root `specs/`.

**Name.** `NN-short-slug.md`. `NN` is the next number in that folder,
counted only over files already named `NN-*.md` (unnumbered legacy specs
like `server/specs/blast-radius.md` do not count, and are not renamed).
Numbering is per folder. Spec ID: `SPEC-NN` in the root folder,
`SPEC-<module>-NN` in a module folder (e.g. `SPEC-client-03`), so IDs stay
unique across folders.

**Shape.** Exactly these sections, in this order:

```md
# Spec: <feature>   |   Spec ID: SPEC-NN   |   Status: draft
Supersedes: <link to the older spec whose decision this replaces — omit the line when none>

**Affected modules:** <list>
**Design sources:**
- <"User description, <date>"> — <one line on what it established>
- <"Screenshot 1: PR page, Overview tab"> — <what it shows that the spec relies on: elements, labels, states>

## Problem & Motivation
## Goals / Non-goals
## User stories
## Acceptance criteria (EARS)
## Edge cases
## Non-functional
## Inputs (provenance)
## Untrusted inputs
## Proposed improvements
## [NEEDS CLARIFICATION: …]
```

Section rules:

- **Goals / Non-goals** — Non-goals are explicit boundaries: what this
  feature does *not* do, including rejected proposals.
- **User stories** — each with an ID:
  `- **US-1** As a <role>, I want <capability>, so that <benefit>.`
  Only real roles of this product (a reviewer, a repo owner, Claude Code via
  MCP — see the glossary).
- **Acceptance criteria (EARS)** — one line per criterion, in this exact
  format (the self-check script parses it):
  `- **AC-1** · P1 · US-1 · Verify: e2e — WHEN <trigger>, the <system> shall <response>.`
  - **ID** `AC-n`, numbered without gaps.
  - **Priority** `P1` (the feature is not done without it), `P2` (expected,
    may ship in a follow-up), `P3` (nice to have). The planner slices work
    by it.
  - **Trace** — the story it serves (`US-n`, several as `US-1,US-3`), or
    `NFR` for a criterion that comes from `Non-functional` alone. Every
    story is served by at least one AC.
  - **Verify** — how the criterion can be observed: `unit`,
    `integration`, `e2e`, or `manual`. A hint for the planner's test steps,
    not a test design; prefer the cheapest level that can really observe
    it. `e2e` marks a candidate for a `e2e/specs/*.flow.json` flow.
  - **Statement** — exactly one EARS pattern:
    - Ubiquitous: `The <system> shall <response>.`
    - Event-driven: `WHEN <trigger>, the <system> shall <response>.`
    - State-driven: `WHILE <state>, the <system> shall <response>.`
    - Unwanted behavior: `IF <condition>, THEN the <system> shall <response>.`
    - Optional feature: `WHERE <feature is enabled>, the <system> shall <response>.`
    Name the system concretely ("the PR page", "the review API", "the MCP
    tool"). One trigger, one response; no "and/or" that hides two
    criteria; no unmeasurable words ("fast", "user-friendly") — give a
    number or an observable outcome. See [ears-examples.md](ears-examples.md).
- **Edge cases** — each with the AC that handles it (`→ AC-7`), or
  `[NEEDS CLARIFICATION: …]` when nobody decided yet. When the feature has
  three or more visible states or a flow across modules, end this section
  with one Mermaid `stateDiagram-v2` or user-flow diagram of what the user
  sees (load the `mermaid-diagram` skill for the syntax) — never a
  sequence of internal calls, which is the how.
- **Non-functional** — always these four lines, each with a requirement
  (traced by an AC marked `NFR` or a story) or `n/a — <why>`:
  - **Performance** — a number: latency, size bound, item count.
  - **Security & privacy** — access, secrets, what is stored.
  - **Accessibility** — keyboard, focus, labels, contrast, live regions.
  - **Cost & LLM** — how many LLM calls per user action (0 is a valid and
    good answer), which model setting decides it, how the cost shows up in
    the run record, and a confirmation that nothing here auto-triggers a
    review (review only ever runs on an explicit `POST /pulls/:id/review`).
- **Inputs (provenance)** — a table: every input the feature reads or
  shows, and where it comes from, tagged
  `[reused: <the existing lesson output / pipeline / data it reuses, e.g. L04 blast radius>]`
  or `[deterministic: <how it is computed without an LLM>]`. An input that
  comes from an LLM call says so in plain words next to the tag, with how
  many calls.
- **Untrusted inputs** — every piece of foreign text the feature reads
  (PR titles and bodies, diffs, commit messages, repo files, LLM output)
  and the rule for it: it is treated as **data, never as instructions** —
  it cannot change prompts, tools, or what the system does. Name where it
  is rendered and how it is escaped. Write "None." only when nothing
  foreign is read.
- **Proposed improvements** — `- **P-1** <proposal> — <one line of why>`.
  This section exists only while the spec is a draft.
- **[NEEDS CLARIFICATION: …]** — every open item, each as
  `- [NEEDS CLARIFICATION: <question>] — affects: <section or AC-n>`. The
  same marker may also appear inline where the gap sits.

**Size.** A spec with more than 20 ACs or about 400 lines is usually two
features, or is sliding into the how. Before writing past that, propose a
split to the user (each part its own spec, with a line in Goals naming the
other).

## Step 6 — Supersedes

When the new spec replaces a decision of an older one, fill `Supersedes:`
with a link to it, and add one line under the older spec's title:
`Superseded by: <link to the new spec> — <which decision>`. Change nothing
else in the older spec — not its status, not its text.

## Step 7 — Self-check

Before showing the draft, run both halves and fix what they find:

1. **Mechanical** — `node .claude/skills/spec-creator/scripts/check-spec.mjs <spec path>`.
   It checks the header, file name and Spec ID, section order, AC format
   and numbering, EARS opening and `shall`, priorities, `Verify` values,
   US ↔ AC tracing, Edge case → AC links, the four Non-functional lines,
   and that an approved spec has no proposals left. Errors must be fixed;
   warnings are judged one by one.
2. **Judgement** — re-read the spec and confirm:
   - every edge case, every accepted proposal and every research finding
     that constrains behaviour is covered by an AC;
   - each AC is one observable behaviour — someone who never saw this
     conversation could say pass or fail;
   - no sentence describes the how (the script only warns on obvious
     words; you judge the rest);
   - every term matches [glossary.md](glossary.md) and the code;
   - nothing in the spec contradicts a `CLAUDE.md` rule or an insights
     entry you loaded;
   - every untrusted input from Step 3 is in `Untrusted inputs`;
   - `Design sources` holds everything taken from the screenshots.

## Step 8 — Review with the user, then approve

1. Show the user: the path, a summary of the ACs by priority, the proposals
   `P-n` with your recommendation for each, and the open
   `[NEEDS CLARIFICATION]` items.
2. Ask the user to accept or reject each proposal and to confirm the spec
   (one `AskUserQuestion`; a `multiSelect` question works well for the
   proposals).
3. Apply the answers with Edit:
   - an accepted proposal becomes AC(s) (and an edge case if it is one);
   - a rejected proposal becomes a Non-goal line;
   - remove the `## Proposed improvements` section;
   - an answered `[NEEDS CLARIFICATION]` is folded into its section and
     removed from the list.
4. Run the self-check again. Only after the user explicitly confirms, set
   `Status: approved`. Open `[NEEDS CLARIFICATION]` items may remain in an
   approved spec when the user accepts them as open; never approve without
   confirmation.

## Marking a spec implemented

`/spec-creator mark-implemented <spec path>` — the only route to
`Status: implemented`. Set it only when the user asks, and only when a
`plan-verifier` report for the plan built from this spec is available in
the conversation or named by the user, and it shows every `P1` AC as
passed. If a `P1` AC failed or was unverified, list those ACs and leave
the status as it is. Change nothing but the status.

## Step 9 — Hand off

End with: the spec path, its ID and status, the count of ACs by priority,
the count of open `[NEEDS CLARIFICATION]` items, and the next step — run
the `implementation-planner` agent with this spec path. Then run the
`engineering-insights` check, as the root `CLAUDE.md` asks at the end of
every task (writing nothing is the usual outcome for a spec run).
