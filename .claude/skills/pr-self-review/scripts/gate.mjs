#!/usr/bin/env node
// The merge gate: is there a fresh, full, PASS report for exactly the current
// change set? Exit 0 = yes, 2 = no (reason on stderr). Used by the pre-PR hook.
import path from "node:path";
import { REPORT, STATE, collectState, readJson } from "./lib.mjs";

const RERUN = "Run /pr-self-review (the pr-self-review skill) and fix every CRITICAL finding.";

export function evaluate() {
  const report = readJson(REPORT, null);
  if (!report) return { ok: false, reason: `No self-review report found. ${RERUN}` };

  const { diffHash } = collectState(report.base);
  if (diffHash !== report.diff_hash) {
    return { ok: false, reason: `The self-review report is stale — the changes differ from what was reviewed (${report.diff_hash.slice(0, 8)} → ${diffHash.slice(0, 8)}). ${RERUN}` };
  }
  if (report.verdict !== "PASS") {
    const crit = report.findings.filter((f) => f.severity === "CRITICAL");
    const lines = crit.map((f) => `  - ${f.id} ${f.rule} ${f.file}${f.line ? ":" + f.line : ""}`).join("\n");
    return { ok: false, reason: `PR SELF REVIEW: BLOCKED — ${crit.length} critical finding(s) must be fixed before opening a PR / merging:\n${lines}\nDetails: ${path.relative(process.cwd(), path.join(STATE, "last-report.md"))}. Fix them, then re-run /pr-self-review.` };
  }
  if (report.mode !== "full") {
    return { ok: false, reason: `The last self-review ran in "${report.mode}" mode (unverified findings / tests skipped). Re-run without --fast/--no-ci.` };
  }
  return { ok: true, reason: `PASS @ ${report.head_sha.slice(0, 7)} (diff ${report.diff_hash.slice(0, 8)})` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = evaluate();
  (r.ok ? console.log : console.error)(r.reason);
  process.exit(r.ok ? 0 : 2);
}
