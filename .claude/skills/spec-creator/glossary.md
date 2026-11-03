# Glossary

The product's terms, as the code names them. A spec uses these words and
no synonyms ("issue" for finding, "scan" for review, "project" for repo).
Sources: `server/src/db/schema/*`, `server/src/vendor/shared/contracts/*`.
When the code and this file disagree, the code wins — note it for the user.

| Term | Meaning |
|---|---|
| **Workspace** | The top-level container; users are its members. Repos, PRs, reviews and runs belong to one workspace. |
| **Repo** | A GitHub repository imported into a workspace and synced locally. |
| **Index** (repo-intel) | What DevDigest computes over a synced repo: file graph, PageRank (file rank), symbols, references, file facts (endpoints, crons), code chunks, repo map. Has a status — `full`, `partial`, `degraded`, `failed` — and the commit it was built at, so it can lag behind the repo. |
| **PR** (pull request) | A pull request imported from a repo, with its files and commits. Importing never triggers a review. |
| **Agent** | A configured reviewer: system prompt, model, skills, gate settings. Has versions. |
| **Skill** | A versioned piece of reviewer knowledge attached to agents. |
| **Run** (agent run) | One execution of one agent on one PR. Records provider, model, duration, tokens, cost (USD, or unknown when a call had no price), status, error, findings count, score, blockers, source (`local` or `ci`). |
| **Multi-agent run** | One trigger that starts several agent runs on the same PR. |
| **Review** | The result a run produces for a PR: kind `summary` or `review`, verdict, summary text, score. Started only by an explicit `POST /pulls/:id/review`. |
| **Verdict** | `request_changes`, `approve` or `comment`. |
| **Finding** | One issue a review reports at a file and line range: severity, category, title, rationale, optional suggestion, confidence. |
| **Severity** | `CRITICAL`, `WARNING`, `SUGGESTION`. |
| **Category** | `bug`, `security`, `perf`, `style`, `test`. |
| **Finding action** | What the user does to a finding: `accept`, `dismiss`, `learn`, `reply`. |
| **Blocker** | A finding at or above the agent's CI fail-on severity. |
| **Trace** | The full record of one run (prompts, calls, outputs). |
| **Intent / Brief** | The PR's stated intent and the generated PR brief card shown on the PR page. |
| **Blast radius** | What else in the repo a PR's changed files can reach: importers, callers, endpoints, crons. Read from the index, no LLM. |
| **Onboarding** | The generated tour of a repo for a human: reading path, critical paths, stack, setup steps. |
| **Conventions** | Project rules extracted from a repo; each `pending`, `accepted` or `rejected`. |
| **Memory** | Stored learnings the reviewer reuses across reviews. |
| **Eval case / eval run** | A saved scenario with expected findings, and one run of an agent or skill against the cases. |
| **CI run** | A review run started from CI rather than locally; status `succeeded`, `failed`, `no_findings`, `running`. |
| **MCP tool** | A DevDigest capability exposed to Claude Code by `mcp-server/`, named `devdigest_*`. |

## Roles in user stories

- **Reviewer** — the person reading a PR and triaging findings.
- **Repo owner** — imports repos, configures agents, skills and CI.
- **Claude Code (via MCP)** — an agent calling `devdigest_*` tools on the
  user's behalf.
