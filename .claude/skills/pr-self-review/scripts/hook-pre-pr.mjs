#!/usr/bin/env node
// PreToolUse hook (matcher: Bash). Blocks a real `gh pr create` invocation unless
// the self-review gate passes. Exit 2 = block, and stderr is fed back to Claude.
// A mere *mention* (quoted string, heredoc body, comment) must not trigger it.
import { evaluate } from "./gate.mjs";

const CALL =
  /(?:^|[;&|(`\n]|\$\()\s*(?:(?:[A-Za-z_][A-Za-z0-9_]*=\S*|sudo|command|time|env|exec|nohup)\s+)*gh\s+pr\s+create\b/;

export function invokesPrCreate(command, depth = 0) {
  // sub-shell strings are real code: `bash -c '…'`, `eval "…"`
  if (depth < 3) {
    for (const m of command.matchAll(/(?:\b(?:ba|z|da)?sh\s+(?:-\w+\s+)*-c|\beval)\s+(?:'([^']*)'|"((?:[^"\\]|\\.)*)")/g)) {
      if (invokesPrCreate(m[1] ?? m[2], depth + 1)) return true;
    }
  }
  const stripped = command
    .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2\b/g, "") // heredoc bodies
    .replace(/'[^']*'/g, "''") // single-quoted strings
    .replace(/"(?:[^"\\]|\\.)*"/g, '""') // double-quoted strings
    .replace(/(^|\s)#[^\n]*/g, "$1"); // comments
  return CALL.test(stripped);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;

  let command = "";
  try {
    command = JSON.parse(raw)?.tool_input?.command ?? "";
  } catch {
    process.exit(0); // never break unrelated tool calls
  }
  if (!invokesPrCreate(command)) process.exit(0);

  let r;
  try {
    r = evaluate();
  } catch (e) {
    r = { ok: false, reason: `Could not evaluate the self-review gate (${e.message}). Run /pr-self-review.` };
  }
  if (r.ok) process.exit(0);
  console.error(`Blocked \`gh pr create\`: ${r.reason}`);
  process.exit(2);
}
