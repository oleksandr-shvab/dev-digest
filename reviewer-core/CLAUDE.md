# reviewer-core — `@devdigest/reviewer-core`

Pure review engine: diff → prompt → LLM → findings. Consumed by `server`
(local studio reviews) and, per its `package.json` description, a future CI
agent-runner — both via tsconfig path alias, not an npm install. See root
[`CLAUDE.md`](../CLAUDE.md) for the whole-repo map.

## Commands

`typecheck` / `test` — see `package.json`.

## Map

- `src/review/run.ts` — `reviewPullRequest()`: picks single-pass vs
  map-reduce, calls the LLM, merges partial reviews, recomputes score from
  grounded findings.
- `src/prompt.ts` — `assemblePrompt()`: system prompt + prompt-injection
  guard + ordered `<untrusted>`-wrapped sections (PR description, repo
  skeleton, callers digest, diff).
- `src/grounding.ts` — the anti-hallucination gate: drops any finding whose
  line range doesn't intersect a real diff hunk.
- `src/llm/` — `LLMProvider` interface + OpenRouter implementation (Anthropic/
  OpenAI implementations live in `server/src/adapters/llm`, not here).
- `src/output/` — Zod schemas for the structured `Review`/`Finding` shape.

## Conventions

- **No DB/GitHub/filesystem/network imports.** The only side effect allowed
  is the injected `LLMProvider`. This is what makes the engine unit-testable
  and shareable between `server` and a future CI runner — don't break it for
  a one-off convenience.
- Every LLM-sourced string that reaches the prompt (PR description, repo
  map, callers digest, diff) must go inside an `<untrusted>` block.

## Do not touch

- Don't add `fs`/`child_process`/`net`/DB-client imports here — that logic
  belongs in `server/src/adapters/` or `server/src/modules/reviews/`.

## More

Read [`insights.md`](insights.md) before touching files in this module;
append to it through the `engineering-insights` skill when a task here
teaches something non-obvious.

[`docs/`](docs/) · [`specs/`](specs/) · [`insights.md`](insights.md)
