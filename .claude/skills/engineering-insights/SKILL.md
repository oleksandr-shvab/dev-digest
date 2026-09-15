---
name: engineering-insights
description: "Captures non-obvious engineering learnings into the insights.md of the module that was touched — server/, client/, reviewer-core/, e2e/, or the repo root for cross-cutting and infra work. Use at the start of a task to load the touched module's existing insights before writing code, and again when a task ends or when a non-obvious discovery happens mid-task: a failed approach, a surprising gotcha, a convention learned the hard way, a decision with its reason, or a recurring error and its fix. Also use when the user says wrap up, what did we learn, session review, or retro, or mentions insights, learnings, or a retrospective."
---

# Engineering Insights

Keeps a module's `insights.md` as a growing, high-signal memory of things
learned the hard way — so the next session doesn't re-discover them. Two
moments trigger this skill: before work starts, and when it ends.

## Before work starts

1. Identify which module(s) the task touches, using the routing table below.
2. Read the full `insights.md` for each — plus the root `insights.md` if the
   task is cross-module or touches infra (`scripts/`, `docker-compose.yml`,
   `.github/`, root config).
3. State in one line what was loaded (e.g. "Loaded server/insights.md — 3
   entries, most relevant: X"). This is a forcing function, not decoration —
   it's the check that the file was actually read, not skimmed.
4. Treat these entries as high-confidence guidance unless they contradict
   `CLAUDE.md` or the code you're actually looking at — in that case the code
   wins, and the stale entry becomes a candidate for a correction later.

## Routing table

| Touched | Insights file |
|---|---|
| `server/**` | `server/insights.md` |
| `client/**` | `client/insights.md` |
| `reviewer-core/**`, `docs/agent-prompts/**` | `reviewer-core/insights.md` |
| `e2e/**` | `e2e/insights.md` |
| `scripts/**`, `docker-compose.yml`, `.github/**`, other root files, or a lesson spanning 2+ modules | `insights.md` (repo root) |

One insight goes into one file. If a lesson genuinely differs by module,
write two separate entries — one per file — never copy the same bullet twice.

## When work ends

For each candidate learning, run it through the gate below. Then, for every
candidate that survives, **read the full target file first** — always, even
if you're confident it's not already there — and only then decide what to
write.

### The gate

Write an entry only if it passes all five:

1. **Non-obvious** — not derivable just by reading the code or `CLAUDE.md`.
   Test: if this would be obvious to anyone reading the code, don't write it.
2. **Cold-actionable** — an agent reading this cold knows exactly what to do
   or avoid, without re-investigating.
3. **Evidenced** — names a real file path, command, or exact error text.
4. **Durable** — still true next month, not "the build was red today."
5. **Not already recorded** — confirmed by actually reading the file (the
   step above), not by assuming.

**An empty result is correct.** A routine task — a typo fix, a small change
with no surprises — produces zero entries. Never invent an insight just to
have something to write. This is a judgment call made inline over the session
you're already in — there's no separate transcript-parsing step counting
messages, so don't justify writing (or not) by session length or message
count; go by whether something genuinely non-obvious happened.

**Cap:** even a rich session should yield only the handful of entries that
truly matter — soft cap around 5 per wrap-up. Producing more is a sign the
task was too broad for one wrap-up, not that every candidate belongs.

### Read-then-write

**Append-only, no exceptions here: every change is a new bullet added at the
end of a section.** Never edit the wording of an existing entry, never
reorder or delete one, never rewrite a section — not even to fix a typo in
someone else's entry. This holds for the correction case below too: a
correction is a new bullet placed after the old one, not a change to it.
(The only thing allowed to remove or rewrite entries is an explicit,
user-requested prune — see `entry-format.md` — which this skill does not do
on its own.)

After reading the target file, exactly one of these is true for each
surviving candidate:

- **Not present at all** → append the new entry to the right section (see
  `entry-format.md`).
- **Present and still accurate** → this is a duplicate. Write nothing.
- **Present but outdated or contradicted** → append a dated correction
  directly below the original entry.

## References

- [`entry-format.md`](entry-format.md) — the file's seven fixed sections,
  entry anatomy, how to write a correction, pruning.
- [`examples.md`](examples.md) — bad-vs-good entries drawn from this repo.
