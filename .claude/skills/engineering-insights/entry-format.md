# Entry format

**Append-only.** Every change to this file is a new bullet added at the end
of a section — nothing else. Never edit an existing entry's wording, reorder
entries, or delete one, including to fix someone else's typo. A correction
(below) is still an addition: a new bullet placed after the old one, not a
change to it. The one exception is pruning, and it's deliberately not
something that happens as a side effect of a normal wrap-up — see Pruning
below.

## The seven sections

Fixed order. Never remove a section, even when it's empty — an agent
scanning the file should always find the same shape.

| Section | What goes there |
|---|---|
| What Works | An approach or solution that worked, worth reusing. |
| What Doesn't Work | Dead ends and antipatterns. Most valuable section, most often skipped — don't skip it. |
| Codebase Patterns | Conventions and architectural decisions, with the reason behind them. |
| Tool & Library Notes | Dependency and tooling quirks. |
| Recurring Errors & Fixes | An error seen 2+ times, and its fix. |
| Session Notes *(optional)* | Low-signal notes that don't fit any section above. Keep to the last ~10; prune the rest before it accumulates. |
| Open Questions | Unresolved things worth flagging. Once answered, move the answer into the right section above and remove the question. |

## Entry anatomy

One dated bullet per entry, appended to the end of its section:

```
- **YYYY-MM-DD** — <what actually happened, or how the codebase actually is> — <what to do about it>. `path/to/file.ts`
```

- Date is today's date, absolute (not "last week").
- Don't repeat the category in the text — the section it's filed under
  already says that.
- Evidence is mandatory: a real path, a command, or exact error text. No
  evidence, no entry.
- Keep it to one or two sentences. If it needs a paragraph, it's not one
  insight — split it, or it's actually documentation and belongs in `docs/`.

## Corrections

When an existing entry is outdated or wrong, don't edit or delete it —
append a new bullet right below it:

```
- **YYYY-MM-DD** — Correction of the entry above: <what changed and why>. `path`
```

The history of "we used to think X" is itself useful signal — that's why a
correction is appended, not swapped in for the original.

## Pruning

Not part of a normal wrap-up — a separate, explicit action, only when the
user asks for it (e.g. "prune insights"). Rough ceiling: ~50–100 entries per
file before signal-to-noise drops. When pruning:

- Remove entries about code that's since been deleted or rewritten.
- Merge near-duplicate entries into one.
- Resolve contradictions — keep the current truth, fold the old one into a
  correction bullet or drop it.
