---
name: analyze-workflow
description: "Manual retrospective on a finished multi-agent workflow (after /run-plan or a hand-driven spec → plan → implement → verify chain): says how many agents ran, in which order and how much in parallel, where the work and tokens went, what was hard, what went easily, which work was duplicated between agents and what was missed, and proposes concrete changes to agents, skills, briefs or the plan, each as a ready-to-paste before → after. By default it reads only what is already in this conversation; with `deep` it also reads the session and subagent transcripts for exact token counts and cross-agent duplicates. Output: the full report in chat plus one appended entry in docs/retro/ledger.md, where module insight candidates also go. Never starts by itself and never edits an agent, skill, plan, spec or insights.md. Usage: /analyze-workflow [deep] [session:<id>] [since:<ISO time>]"
argument-hint: "[deep] [session:<id>] [since:<ISO time>]"
disable-model-invocation: true
---

# Analyze workflow

You review how a multi-agent run went and propose what to change. The
user starts you by hand; nothing else does, and you never start yourself
or are chained from another skill. You report and propose; you do not
apply a proposal.

Arguments (any order):

| Argument | Meaning | Default |
|---|---|---|
| `deep` | also read the transcripts (see § 1) | off — this conversation only |
| `session:<id>` | with `deep`: which session to read | the newest session of this directory |
| `since:<ISO time>` | with `deep`: ignore everything before it, for a session that also held unrelated work | the whole session |

## Limits

- Your only write is **one appended entry** in `docs/retro/ledger.md`
  (create the file with a one-line title if absent). Do not edit an earlier
  entry, an agent, a skill, a plan, a spec, `CLAUDE.md` or any
  `insights.md`; never commit.
- Bash is read-only (`ls`, `grep`, `git log`, `git status`) plus, in
  `deep`, the script in § 1. Exclude the nested `dev-digest/` clone from
  every search.
- **Numbers come from a source you can name**: the conversation's own
  agent results, or the script. Never add tokens up by hand, never turn
  them into money (there is no price list here), never estimate a figure
  nobody printed. What you could not find goes in "Not measured".
- **Evidence for every finding**: an agent number, a file path, a quoted
  line or a number. A finding without one is dropped.
- Describe what happened to the work, not who is to blame: "the brief did
  not name the owned paths" is a finding, "the agent was sloppy" is not.
- Never paste a secret, a token or a long excerpt into the chat or the
  ledger; quote at most one line of an error or a report.

## 1 — Collect

**Default (this conversation).** Take, from the conversation, the agent
launches (type, description, background or not, order, time when shown),
each agent's returned report, completion notices, errors you can see, the
plan or spec the run followed, and `.claude/run-plan-logs/<slug>.md` if
it exists. Token and duration figures count only when an agent result or
notice printed them; otherwise they are "not measured — run with `deep`".
If the conversation holds no agent run, say so in one line and stop: ask
the user for `deep session:<id>` if the run was in another session.

**`deep`.** Run, and read the second output:

```sh
node .claude/skills/analyze-workflow/scripts/collect.mjs [--session <id>] [--since <ISO>] --text
node .claude/skills/analyze-workflow/scripts/collect.mjs [--session <id>] [--since <ISO>] > <scratchpad>/workflow.json
```

It gives per agent: type, brief size, status, duration, turns, tokens,
tools, files written, errors, the handback report; plus `waves`,
`maxParallel`, `byAgentType` and cross-agent `duplicates`. Tokens are
counted once per API request: `freshInput` (new text sent), `cache_read`
(context re-read from cache — large, cheap, a sign of long sessions) and
`output`. Report all three; call `freshInput` + `output` "work" and
`cache_read` "context re-reads". With `agents` = 0, say so and stop.

Open an agent's own transcript
(`~/.claude/projects/<cwd, non-alphanumerics → "-">/<session>/subagents/agent-<id>.jsonl`)
**only** for a flagged agent: status other than `completed`, any `errors`,
`turns` or `freshInput` above twice the median of its type, or a report
that says `blocked` / `deviation`. Read around the first error and the
last 20 lines with `grep`/`sed`, never the whole file.

Say in one line what you analyzed: mode, agents, waves.

Then read `docs/retro/ledger.md` (if it exists) once: you use it to mark
a proposal that an earlier entry already made and that is still not
applied.

## 2 — Judge

Work through these in order; keep a finding only with evidence.

**Order and parallelism.** Which agents ran together, which after another.
A one-agent wave is a finding only when its owned paths were disjoint from
the next wave's and it did not feed it (it could have run in parallel);
two agents in one wave editing the same file is always a finding.

**Where the work went.** Main session vs agents; the agent type and the
single agent that took the most; whether turns or brief size explain it. A
big brief repeated across agents points at plan text pasted instead of
named. Without `deep`, say what the conversation shows and no more.

**What was hard.** Errors with their first line, an agent with many more
turns than its peers, repeated identical commands in one agent (a retry
loop), `blocked`/`deviation` in a report, a fix round in the run log. Name
the cause when the evidence shows it, else "cause not visible". A non-zero
exit that is the command's normal answer (`grep` finding nothing) is not an
error.

**What was easy.** Agents with no errors, no deviation and at most the
median turns; name what they had in common (a brief that named paths and
`Done when`, a plan step with exact files) — the pattern to keep.

**Duplicated work.** The same file read by most agents or twice by one
(a plan, spec or `insights.md` read once per agent is expected); the same
command run by several agents (a baseline typecheck per agent: the
orchestrator could run it once and pass the result); the same fact in
several reports. In `deep`, start from `duplicates`.

**What was missed.** Plan or spec items with no matching line in any
report; `unverified`/`skipped` items; a finding a later agent raised that
an earlier brief could have prevented; an AC with no test step; an agent
that reported done while its step was reopened. Name the item and the
agent that should have covered it.

**Proposals.** For each finding that a change in one place would remove,
write the change itself: the file, the current wording (quote it), the new
wording. Not "improve the briefs" but "add `Owned paths:` to the brief
list in `.claude/skills/run-plan/SKILL.md` § 2". At most 7, ordered by
effect; mark one the ledger already holds as "repeats R-…, not applied".
A change to an agent's `tools`, a brief template, a plan field or a skill
rule is a proposal; a change to product code is not your job.

**Module insight candidates.** A lesson about the repo or the tools that
is true beyond this run, not obvious from the code, with a path or an
exact message as evidence (the gate of the `engineering-insights` skill).
Tag each with a module from its routing table: `server`, `client`,
`reviewer-core`, `e2e`, `mcp-server`, or `root` (also for lessons about
`.claude/` agents and skills). Zero is a normal answer.

## 3 — Report in chat

English, these sections in this order, one screen each, tables over prose:

```md
# Workflow retro: <one-line subject>
<mode> · <session id or "this conversation"> · <N agents, W waves, max M parallel>

## At a glance      — 3–5 bullets: result in numbers, what went best, what cost most
## Order and parallelism   — table wave | agents | started | duration; one paragraph
## Where the work went     — table main / per agent type / total (work, context re-reads, turns); biggest consumer and why. Money: not computed.
## What was hard           — finding · evidence · cause or "cause not visible"
## What went easily        — finding · evidence · pattern to keep
## Duplicated work         — finding · evidence · what would avoid it
## What was missed         — item · who should have covered it · evidence
## Proposals               — # | file | current → new wording | effect | evidence
## Module insight candidates — module · lesson · evidence
## Not measured            — what you could not say, and why (e.g. tokens without `deep`)
```

## 4 — Append to the ledger

Append one entry at the end of `docs/retro/ledger.md`, newest last, in this shape (the id is `R-<YYYY-MM-DD>-<n>`, `n` counting that day's entries):

```md
## R-<id> · <subject> · <context|deep>
- Run: <session or "conversation"> · <N agents, W waves, max M parallel> · work <n> / re-reads <n> (or "tokens not measured")
- Went well: <one line>
- Hard / most costly: <one line>
- Proposals (proposed): <P1 file — change · evidence>; <P2 …>   (repeats R-…, not applied — when so)
- Module insights: <module — lesson · evidence>; … (or "none")
```

Compact: the chat holds the full text. Never rewrite an older entry; a
later entry may say "applied" or "rejected" about an earlier proposal by
its id, and only when the user told you so in this conversation.

## 5 — Hand off

End the chat with: the ledger entry id and path, the totals line, the top
three proposals, and nothing else. The module insight candidates stay in
the ledger; they reach a module's `insights.md` only when the user runs
`engineering-insights` on them, by hand.
