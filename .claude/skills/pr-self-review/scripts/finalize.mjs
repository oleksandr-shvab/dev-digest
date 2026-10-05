#!/usr/bin/env node
// Step 9: merge everything, apply suppressions, compute the verdict
// DETERMINISTICALLY (the model never counts), write last-report.json/.md.
//   --fast   verification was skipped: unverified CRITICALs stay CRITICAL
import fs from "node:fs";
import path from "node:path";
import {
  STATE, MANIFEST, PLAN, REPORT, SUPPRESSIONS, SEV_ORDER,
  findingId, globToRegExp, loadFresh, readJson, writeJson,
} from "./lib.mjs";

const fast = process.argv.includes("--fast");
const manifest = readJson(MANIFEST);
const plan = readJson(PLAN, { reviewers: [], unrouted_skills: [], deterministic_only: [], warnings: [] });
if (!manifest) {
  console.error("No manifest.json — run collect-diff.mjs first.");
  process.exit(1);
}
const ci = readJson(path.join(STATE, "ci.json"), { mode: "skipped", results: [], findings: [] });
// a required module whose deps are not installed means CI parity was NOT actually checked
const ciIncomplete = (ci.results ?? []).some((r) => r.status === "skipped" && !r.optional);
const mode = fast ? "fast" : ci.mode === "full" && !ciIncomplete ? "full" : "partial";

const notes = [];
const fresh = loadFresh();
if (fresh.malformed.length) notes.push(`${fresh.malformed.length} malformed reviewer finding(s) ignored (missing file/rule/severity/evidence/reviewer)`);
for (const r of fresh.rejected) notes.push(`rejected by verification: ${r.rule} @ ${r.file}:${r.line ?? "?"} — ${r.verification_note ?? "no note"}`);

const all = [
  ...readJson(path.join(STATE, "findings.cached.json"), []),
  ...fresh.findings,
  ...readJson(path.join(STATE, "checks.json"), []),
  ...(ci.findings ?? []),
].map((f) => ({ ...f, severity: String(f.severity).toUpperCase(), in_diff: f.in_diff !== false }));

// --- unverified CRITICAL: downgrade in full mode, keep (conservative) in fast mode
for (const f of all) {
  f.id ??= findingId(f);
  if (f.severity === "CRITICAL" && f.verified !== true && !fast) {
    f.severity = "HIGH";
    f.downgraded = "CRITICAL was not verified";
  }
}

// --- suppressions -----------------------------------------------------------
const today = new Date().toISOString().slice(0, 10);
const supFile = readJson(SUPPRESSIONS, { suppressions: [] });
const sups = supFile.suppressions ?? [];
const supUsable = (s) => s.rule && s.reason?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(s.expires ?? "") && s.expires >= today;
for (const s of sups) {
  if (!s.reason?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(s.expires ?? "")) {
    notes.push(`suppression for "${s.rule}" ignored: needs a non-empty "reason" and an "expires" date (YYYY-MM-DD)`);
  } else if (s.expires < today) {
    all.push({
      reviewer: "deterministic", skill: "deterministic", file: ".claude/pr-self-review/suppressions.json", line: 1,
      severity: "MEDIUM", rule: "deterministic/suppression-expired", verified: true, in_diff: true, autofix: false,
      evidence: `suppression "${s.rule}" (${s.path ?? "any path"}) expired on ${s.expires}: ${s.reason}`,
      suggested_fix: "Fix the underlying finding, or renew the suppression with a fresh reason and date.",
      id: findingId({ reviewer: "deterministic", rule: `expired:${s.rule}`, file: s.path ?? "", line: 0 }),
    });
  }
}
const suppressed = [];
const active = [];
for (const f of all) {
  const s = sups.find(
    (x) =>
      supUsable(x) &&
      x.rule === f.rule &&
      (!x.path || globToRegExp(x.path).test(f.file)) &&
      (f.severity !== "CRITICAL" || x.approved_by?.trim()),
  );
  if (s) suppressed.push({ ...f, suppressed_by: { reason: s.reason, expires: s.expires, approved_by: s.approved_by } });
  else {
    if (f.severity === "CRITICAL" && sups.some((x) => x.rule === f.rule && supUsable(x)))
      notes.push(`suppression for CRITICAL "${f.rule}" not applied: CRITICAL suppressions need "approved_by"`);
    active.push(f);
  }
}

const preExisting = active.filter((f) => !f.in_diff);
const inDiff = active.filter((f) => f.in_diff);
const sevRank = (s) => SEV_ORDER.indexOf(s);
inDiff.sort((a, b) => sevRank(a.severity) - sevRank(b.severity) || a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0));

const counts = Object.fromEntries(SEV_ORDER.map((s) => [s, inDiff.filter((f) => f.severity === s).length]));
const blocking = inDiff.filter((f) => f.severity === "CRITICAL");
const verdict = blocking.length ? "BLOCKED" : "PASS";

const report = {
  version: 1,
  verdict,
  mode,
  generated_at: new Date().toISOString(),
  branch: manifest.branch,
  head_sha: manifest.head_sha,
  base: manifest.base,
  base_ref: manifest.base_ref,
  diff_hash: manifest.diff_hash,
  stats: manifest.stats,
  counts,
  blocking: blocking.map((f) => f.id),
  findings: inDiff,
  suppressed,
  pre_existing: preExisting,
  coverage: {
    reviewers: plan.reviewers.map((r) => ({ name: r.name, source: r.source, files: r.files.length, reviewed: r.to_review?.length ?? r.files.length, cached: r.cached_files ?? 0 })),
    unrouted_skills: plan.unrouted_skills,
    not_reviewers: plan.not_reviewers,
    deterministic_only: plan.deterministic_only.length,
    warnings: plan.warnings,
  },
  ci: { mode: ci.mode, results: ci.results },
  notes,
};
writeJson(REPORT, report);

// --- markdown ---------------------------------------------------------------
const L = [];
const loc = (f) => `${f.file}${f.line ? `:${f.line}` : ""}`;
const item = (f) => {
  const tag = f.downgraded ? ` _(downgraded: ${f.downgraded})_` : "";
  const fix = f.suggested_fix ? `\n  - fix: ${f.suggested_fix}` : "";
  const auto = f.autofix ? " · autofix" : "";
  const ev = f.evidence.includes("\n") ? "\n  ```\n  " + f.evidence.split("\n").join("\n  ") + "\n  ```" : ` — ${f.evidence}`;
  return `- **${f.id}** \`${f.rule}\` ${loc(f)}${tag}${auto}${ev}${fix}`;
};
L.push(`# PR Self Review — ${verdict === "PASS" ? "✅ PASS" : "⛔ BLOCKED"}`);
L.push("");
L.push(`\`${manifest.branch}\` vs \`${manifest.base_ref}\` · ${manifest.stats.files} files (+${manifest.stats.added}/−${manifest.stats.removed}) · mode **${mode}** · diff \`${manifest.diff_hash.slice(0, 12)}\``);
L.push("");
L.push(`Critical **${counts.CRITICAL}** · High **${counts.HIGH}** · Medium **${counts.MEDIUM}** · Low **${counts.LOW}** · Info ${counts.INFO}`);
if (mode !== "full") L.push(`\n> ⚠️ mode \`${mode}\`: ${fast ? "critical findings were not independently verified, tests not run" : "CI checks were skipped or a module had no installed deps"} — this report will NOT satisfy the pre-PR gate. Re-run without --fast/--no-ci before opening a PR.`);
if (verdict === "BLOCKED") L.push(`\n**Merge is forbidden until every CRITICAL below is fixed and the review is re-run.** Do not open the PR.`);
for (const sev of SEV_ORDER) {
  const list = inDiff.filter((f) => f.severity === sev);
  if (!list.length) continue;
  L.push("", `## ${sev} (${list.length})`, ...list.map(item));
}
L.push("", "## Coverage", "", "| Reviewer | Files | Reviewed now | From cache |", "|---|---:|---:|---:|");
for (const r of report.coverage.reviewers) L.push(`| ${r.name} | ${r.files} | ${r.reviewed} | ${r.cached} |`);
L.push("", `Deterministic checks always run; ${plan.deterministic_only.length} changed file(s) matched no skill (docs, e2e, config).`);
if (plan.unrouted_skills.length) L.push(`\n⚠️ Unrouted skills (ran via README-scope fallback — add a rule to routing.json): ${plan.unrouted_skills.join(", ")}`);
for (const w of plan.warnings) L.push(`\n⚠️ ${w}`);
if (ci.results.length) {
  L.push("", "## CI parity", "", ...ci.results.map((r) => `- ${r.module} ${r.step}: **${r.status}**${r.ms ? ` (${(r.ms / 1000).toFixed(1)}s)` : ""}`));
}
if (suppressed.length) {
  L.push("", `## Suppressed (${suppressed.length})`, ...suppressed.map((f) => `- \`${f.rule}\` ${loc(f)} [${f.severity}] — ${f.suppressed_by.reason} (until ${f.suppressed_by.expires}${f.suppressed_by.approved_by ? `, approved by ${f.suppressed_by.approved_by}` : ""})`));
}
if (preExisting.length) {
  L.push("", `## Pre-existing, not part of this diff (${preExisting.length}) — non-blocking`, ...preExisting.map((f) => `- [${f.severity}] \`${f.rule}\` ${loc(f)} — ${f.evidence.split("\n")[0]}`));
}
if (notes.length) L.push("", "## Notes", ...notes.map((n) => `- ${n}`));
const md = L.join("\n") + "\n";
fs.writeFileSync(path.join(STATE, "last-report.md"), md);
console.log(md);
