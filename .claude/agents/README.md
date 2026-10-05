# Agents

Project subagents for Claude Code. One file per agent in this folder; the file
is the source of truth for that agent's prompt. This README is the map: who does
what, with which permissions, and what goes in and out. It does not repeat the
prompts.

## The set

| Agent | Job | Model | Tools | Preloaded skills |
|---|---|---|---|---|
| [researcher](researcher.md) | Answers one concrete question with cited evidence, from this repo or from external sources | `sonnet` | Read, Grep, Glob, Bash, WebSearch, WebFetch | none |
| [planner](planner.md) | Turns one requirement into a Development Plan | `opus` | Read, Grep, Glob, Write | 12 project skills (below) |
| [implementer](implementer.md) | Executes an approved plan and verifies its own diff | `sonnet` | Read, Edit, Write, Grep, Glob, Bash, Skill | the same 12 |
| [plan-verifier](plan-verifier.md) | Checks the finished code against every item of a plan; pass, fail or unverified with evidence | `opus` | Read, Grep, Glob, Bash | none |
| [architecture-reviewer](architecture-reviewer.md) | Checks architectural boundaries; findings with quoted code and quoted rule | `opus` | Read, Grep, Glob | `onion-architecture`, `frontend-ui-architecture`, `next-best-practices` |
| [test-writer](test-writer.md) | Writes and runs tests for existing code, in test files only | `sonnet` | Read, Grep, Glob, Edit, Write, Bash | `react-testing-library`, `fastify-best-practices`, `engineering-insights` |
| [doc-writer](doc-writer.md) | Documents implemented features with diagrams, in the module's `docs/` and README maps | `sonnet` | Read, Grep, Glob, Write, Edit | `mermaid-diagram` |

Preloaded skills (planner and implementer): `onion-architecture`,
`fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design`,
`zod`, `frontend-ui-architecture`, `next-best-practices`,
`react-best-practices`, `react-testing-library`, `typescript-expert`,
`security`, `engineering-insights`. Their full text is injected into every run
(about 2,600 lines), whatever the task touches.

## How they fit together

```
requirement ──► planner ──► plans/<slug>.md ──► (you approve) ──► implementer ──► report + code changes
                  ▲                                                    ▲                   │
                  │                                                    │                   ▼
              researcher                                               │             plan-verifier
         (open questions,                                              │                   │
          from any agent)                                              │                   ▼
                                                                       │         architecture-reviewer
                                                                       │                   │
                                                                       │                   ▼
                                                                       │              doc-writer ──► docs/ pages
                                                                       │
  returns:  plan-verifier gaps on code ─────────────────────────────────┤
            plan-verifier gaps on tests ──► test-writer ──► suspected defects ─┤
            architecture-reviewer findings, fix inside the plan ───────┘
            architecture-reviewer findings, fix needs a new seam ──► planner
```

- Agents never call each other. Each starts with no memory of the conversation,
  so the plan file on disk is the whole handoff, and the caller (you, or the
  main session) moves it from one agent to the next.
- The implementer still checks only that the code matches the plan and passes
  its checks. `plan-verifier` checks the result against the plan;
  `architecture-reviewer` reviews boundaries; security review is still outside
  this set; `/pr-self-review` remains the gate before a PR.
- No agent commits or opens a PR.

## Responsibilities, permissions, artifacts

### researcher

- **Does:** one repository, external, or combined research question; reports what
  it could not find. Writes nothing.
- **Input:** one concrete question. A vague task gets clarifying questions back
  instead of research.
- **Output:** a cited report (`# Research (repository)` / `(external)`) with a
  mandatory "Not found" section.
- **Permissions:** no Write/Edit, no Skill, no Agent. Bash is for read-only commands,
  by instruction. It is the only agent here with web access.

### planner

- **Does:** reads the touched modules' `CLAUDE.md` and `insights.md`, maps every
  file to skills, and writes the plan. Never writes code.
- **Input:** a requirement, or a spec path.
- **Output:** `plans/<slug>.md` (steps with files, change, skills, dependencies,
  tests, `Done when`; plus out-of-scope, contracts, verification, open
  questions, notes for reviewers), and a short report that points at it. An
  unclear requirement gets a `Needs clarification` block and no file.
- **Permissions:** Write is allowed but by instruction only for `plans/<slug>.md`;
  no Edit, no Bash, no Skill, no Agent. It cannot run anything, so its
  plan's checks are unverified until the implementer runs them.
- **Skill assignment:** takes the path-to-skills table from
  [`pr-self-review/routing.json`](../skills/pr-self-review/routing.json) so that the plan, the
  implementation and the pre-PR gate all use the same routing.

### implementer

- **Does:** executes the plan's steps in order, applies the skills each step
  assigns, runs typecheck and tests per touched module before and after, records
  insights.
- **Input:** a plan path. No path, a missing file, or a plan without steps gives
  a `blocked` report; it never writes a plan itself.
- **Output:** code changes in the working tree and an `# Implementation report`
  (per-step status, verification table with the commands' own summary lines,
  deviations, blockers, notes for reviewers, insights recorded).
- **Permissions:** Edit and Write on the working tree; Bash limited by
  instruction to typecheck/test commands, `pnpm db:generate` for a schema step
  and read-only git; no commits, installs, migrations on the dev DB, Docker volume
  commands, or edits of the plan file. No Agent, no web.
- **Verification scope:** compiles, tests pass, diff stays inside the plan's
  files. Pre-existing failures are reported as such, not fixed.

### plan-verifier

- **Does:** lists every item of a plan (requirement clauses, each step's files,
  change, tests and `Done when`, contracts, verification, out-of-scope) and
  gives each pass, fail or unverified with evidence it read or ran itself.
- **Input:** a plan path, optionally the implementer's report (read as claims,
  never as evidence).
- **Output:** a `# Plan verification` report with a traceability table, gaps,
  unverified items, scope and the commands run.
- **Permissions:** no Write/Edit, no Skill, no Agent, no web. Bash limited by
  instruction to read-only git and the checks of `implementer.md` Step 3. No
  preloaded skills.

### architecture-reviewer

- **Does:** checks dependency direction, code placement and the server/client
  boundary against the preloaded architecture skills, `project-rules.md`, the
  modules' `CLAUDE.md` and `insights.md`; separates introduced from
  pre-existing findings; lists checks that did not run.
- **Input:** "local changes" (the manifest written by
  `.claude/skills/pr-self-review/scripts/collect-diff.mjs`), a plan path, or
  files or a directory.
- **Output:** a `# Architecture review` report: findings with quoted code and
  quoted rule, a checks table, and what was not checked.
- **Permissions:** Read, Grep, Glob only. It cannot write, edit or run
  anything, so without a collected patch "introduced or pre-existing" is
  reported as not determined.

### test-writer

- **Does:** writes and runs tests for existing code in `client/`, `server/` and
  `reviewer-core/`, in each module's own layout; leaves a test failing and
  reports it when the code under test is wrong.
- **Input:** files or behaviours to cover, optionally a plan path or a
  `plan-verifier` gap. A task with no concrete target gets a `Needs
  clarification` block.
- **Output:** test files and a `# Test report` (tests written, runs with the
  commands' own summary lines, suspected defects, not covered, insights).
- **Permissions:** Edit and Write for test files only, by instruction; Bash
  limited to the test and typecheck commands and read-only git. No Skill, no
  Agent, no web; no e2e flows, no new dependencies.

### doc-writer

- **Does:** turns a plan, spec, implementer report or other material into a
  documentation page with Mermaid diagrams, or updates the existing page or
  README map; states only what it found in the code.
- **Input:** a plan path or other material, and the feature's name.
- **Output:** pages under the module's `docs/` or the README maps, and a
  `# Documentation report` (documents, sources read, left out, conflicts,
  diagrams not rendered, lines proposed for the caller).
- **Permissions:** Write and Edit, limited by instruction to `<module>/docs/**`
  and the README maps. No Bash (it cannot run or render anything), no Skill, no
  Agent, no web. It never writes specs, `CLAUDE.md`, `insights.md` or plans.

## What is enforced and what is only asked

- Enforced by `tools`: which tools exist at all (planner cannot run commands;
  nobody here can spawn agents; only researcher can reach the web).
  `architecture-reviewer` cannot write, edit or run anything; `plan-verifier`
  cannot write or edit; `doc-writer` cannot run anything.
- Enforced by `skills`: which skills are in context from the start.
- Asked in the prompt only: planner writes a single file; implementer's Bash
  limits and file scope; `plan-verifier`'s and `test-writer`'s Bash limits; the
  paths `test-writer` and `doc-writer` may write. Claude Code's own documentation calls Bash command
  patterns fragile and not a security boundary, so these are guard rails, not locks.
- `permissionMode` is not set: when the calling session runs in an
  auto-accepting mode, a subagent's own setting is ignored.

## Sources behind the planner and implementer rules

Primary sources are Anthropic's own documentation. "Read in full" means the page
text was fetched and the field names and wording checked against it; the other
sources were read through a summarising fetch tool and are not verified word for word.

| Practice | Source | Where it shows up |
|---|---|---|
| Agent file format and frontmatter fields; `tools` list; omitting `Agent` stops spawning; `skills` injects full text; `disable-model-invocation` skills cannot be preloaded; subagents load `CLAUDE.md` and have no `AskUserQuestion` | [Create custom subagents](https://code.claude.com/docs/en/sub-agents) (read in full) | both files' frontmatter; "Tools and limits"; final paragraph about global reply formats |
| Least-privilege tool lists; one task per agent | same page; [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | planner without Bash/Edit; implementer without Agent/web |
| Bash restrictions are fragile, not a security boundary | [Configure permissions](https://code.claude.com/docs/en/permissions) | planner has no Bash; implementer's command table is stated as instruction |
| Pass long artifacts as files; plans that name files, scope and an end-to-end check | [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system); [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices) | `plans/<slug>.md`; plan sections Out of scope, Steps, Verification |
| A delegation brief states objective, output format, tools and boundaries | multi-agent research system post | exact output formats and boundaries in both prompts |
| Give the agent a check it can run, and require evidence | Best practices for Claude Code | implementer "Verify" step; "claim nothing you did not run" |
| A separate fresh-context reviewer, not the author | Best practices for Claude Code | implementer does not audit architecture or security |
| Description says what the agent does and when to use it | Create custom subagents; [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) | `description` of both agents |

Not from an external source, but from this repo: the single routing table, the
`insights.md` reading rule, `npm_config_verify_deps_before_run=false` (root
[`insights.md`](../../insights.md), 2026-09-24), the Docker-less integration-test
rule ([`TESTING.md`](../../TESTING.md)), the two vendored `shared` copies, and
generated-only migrations. Anthropic publishes no schema for a development plan;
the plan layout is this project's own.

## Sources behind the other four agents

The external pages below were supplied by a research pass and were not
re-opened when the agent files were written. "Secondary" marks a source that is
not the tool's or the standard's own documentation.

| Practice | Source | Where it shows up |
|---|---|---|
| `tools` is an allowlist; `disallowedTools` still leaves Bash and MCP tools; `description` drives delegation; `skills` preloads full text | [Create custom subagents](https://code.claude.com/docs/en/sub-agents) | frontmatter of all four files |
| `permissionMode` can be overridden by the parent session, so it is not a read-only control | same page; [Permission modes](https://code.claude.com/docs/en/permission-modes) | no `permissionMode` anywhere |
| Bash is a write path; no documented read-only mode | same page; [Configure permissions](https://code.claude.com/docs/en/permissions) | `architecture-reviewer` has no Bash |
| Test what the user sees; query priority; `userEvent.setup()` per test, awaited | [Guiding principles](https://testing-library.com/docs/guiding-principles/); [Query priority](https://testing-library.com/docs/queries/about/#priority); [user-event](https://testing-library.com/docs/user-event/intro/) | `test-writer` client rules |
| Behaviour, not implementation (secondary) | [Common mistakes with RTL](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library); [Testing implementation details](https://kentcdodds.com/blog/testing-implementation-details) | `test-writer` client rules |
| Build the app apart from the server; test with `app.inject()` | [Fastify testing guide](https://fastify.dev/docs/latest/Guides/Testing/) | `test-writer` server rules (Vitest, not `node:test`) |
| Show the command and its output; the author is not its own grader; a fresh-context reviewer reports gaps, not style | [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices) | `test-writer` runs, `plan-verifier` |
| Precision first: file and line plus the quoted rule, validate each finding, do not flag when unsure | [code-review command](https://raw.githubusercontent.com/anthropics/claude-code/main/plugins/code-review/commands/code-review.md) | `architecture-reviewer` Step 4 |
| A rule that matched no file is a check that did not run | [ArchUnit user guide](https://www.archunit.org/userguide/html/000_Index.html) | `architecture-reviewer` Step 3 |
| Pre-existing debt reported apart from new violations | [dependency-cruiser CLI](https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md) | `introduced` / `pre-existing` / `not determined` |
| Server/client boundary is a module-graph rule; props must be serializable; `children` Server Components are fine | [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components); [Server and client boundary](https://nextjs.org/docs/app/guides/server-and-client-boundary) | `next-best-practices/rsc-boundaries` check |
| One row per requirement with method, status and result; evidence from the environment; an explicit "unverified" | [NASA product verification](https://www.nasa.gov/reference/5-3-product-verification/); [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents); [Demystifying evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents); [RTM](https://stell-engineering.com/blog/requirements-traceability-matrix) (secondary) | `plan-verifier` traceability table |
| Verifier and reviewer on a different model from the implementer | [Develop tests](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests) | `model: opus` on both |
| One page is one kind of document; reference only describes | [Diátaxis](https://diataxis.fr/compass/) | `doc-writer` Step 3 |
| Change docs with the code; remove dead docs | [Google docs best practices](https://google.github.io/styleguide/docguide/best_practices.html); [Docs as code](https://www.writethedocs.org/guide/docs-as-code/) | `doc-writer` update-not-duplicate rule |
| Fenced `mermaid` blocks render on GitHub, which pins its own Mermaid version | [Creating diagrams](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams); [Mermaid syntax reference](https://mermaid.js.org/intro/syntax-reference.html) | `doc-writer` Step 5 |
| `CLAUDE.md` stays short and links to docs | [Memory](https://code.claude.com/docs/en/memory) | `doc-writer` proposes lines, never edits `CLAUDE.md` |

This repo's own policy, with no external source: never weaken, delete or skip
a test to get a green run (`test-writer`); document only what was found in the
code (`doc-writer`); the `pass` / `fail` / `unverified` scheme and item ids
(`plan-verifier`); the severity levels and `<skill>/<kebab-name>` rule ids
(`architecture-reviewer`, taken from the skills' tags and
`pr-self-review/severity-rubric.md`); the `<module>/docs/` layout, which wins
over the Diátaxis folder scheme; each module's test layout, helpers and
commands, and mocking at `@/lib/api` instead of MSW; no `hooks` and no
`permissionMode`; excluding `dev-digest/`; and the closing paragraph against
leaked reply formats (root [`insights.md`](../../insights.md)).

## Adding or changing an agent

- Keep `description` in double quotes: an unquoted `: ` breaks strict YAML parsers
  (see root [`insights.md`](../../insights.md), 2026-10-02).
- A new agent file may not be visible to the running session for a few minutes. To test
  it at once, run it in its own process: `claude -p --agent <name> ...`.
- Update the table at the top of this file in the same change.
