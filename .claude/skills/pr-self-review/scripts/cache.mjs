#!/usr/bin/env node
// Findings cache, keyed per (reviewer, file):
//   key = sha256(reviewer-instructions hash | severity-rubric hash | insights hash | file blob | file patch)
// so a re-run only reviews files that changed since the last run.
//   split [--no-cache]        adds `to_review` per reviewer to plan.json and writes findings.cached.json
//   store [--only a,b]        stores this run's (verified) findings; empty results are cached too
import fs from "node:fs";
import path from "node:path";
import {
  ROOT, STATE, SKILL_DIR, MANIFEST, PLAN, sha256, readJson, writeJson, loadFresh,
} from "./lib.mjs";

const [cmd, ...args] = process.argv.slice(2);
const plan = readJson(PLAN);
const manifest = readJson(MANIFEST);
if (!plan || !manifest) {
  console.error("Run collect-diff.mjs and route.mjs first.");
  process.exit(1);
}
const fileInfo = new Map(manifest.files.map((f) => [f.path, f]));

const hashTree = (p) => {
  const abs = path.join(ROOT, p);
  if (!fs.existsSync(abs)) return "";
  const stat = fs.statSync(abs);
  if (stat.isFile()) return sha256(fs.readFileSync(abs));
  return sha256(
    fs.readdirSync(abs, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => path.join(e.parentPath ?? e.path, e.name))
      .sort()
      .map((f) => sha256(fs.readFileSync(f)))
      .join(""),
  );
};
const rubricHash = hashTree(".claude/skills/pr-self-review/severity-rubric.md");
const promptHash = hashTree(".claude/skills/pr-self-review/prompts.md");

const reviewerHash = (r) =>
  sha256([
    r.kind === "skill" ? hashTree(path.dirname(r.instructions)) : hashTree(r.instructions),
    rubricHash,
    promptHash,
    ...r.insights.map(hashTree),
  ].join("|"));

const keyOf = (r, rh, file) => {
  const f = fileInfo.get(file);
  return sha256(`${rh}|${r.name}|${f.blob}|${f.patch_sha}`);
};
const entryPath = (r, key) => path.join(STATE, "cache", r.name, `${key}.json`);

if (cmd === "split") {
  const noCache = args.includes("--no-cache");
  const cached = [];
  let total = 0;
  let hits = 0;
  for (const r of plan.reviewers) {
    const rh = reviewerHash(r);
    r.to_review = [];
    r.cached_files = 0;
    for (const file of r.files) {
      total++;
      const p = entryPath(r, keyOf(r, rh, file));
      const entry = !noCache && fs.existsSync(p) ? readJson(p) : null;
      if (entry) {
        cached.push(...entry.findings);
        r.cached_files++;
        hits++;
      } else r.to_review.push(file);
    }
  }
  writeJson(PLAN, plan);
  writeJson(path.join(STATE, "findings.cached.json"), cached);
  // stale agent output from a previous run must not leak into this one
  for (const d of ["findings", "verdicts"]) fs.rmSync(path.join(STATE, d), { recursive: true, force: true });
  console.log(`[cache] ${hits}/${total} (reviewer,file) pairs served from cache; ${cached.length} cached findings`);
  for (const r of plan.reviewers) {
    console.log(`  ${r.name.padEnd(28)} review ${String(r.to_review.length).padStart(3)}  cached ${String(r.cached_files).padStart(3)}`);
  }
} else if (cmd === "store") {
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
  const { findings } = loadFresh();
  let stored = 0;
  let skipped = 0;
  for (const r of plan.reviewers) {
    if (only && !only.includes(r.name)) continue;
    const rh = reviewerHash(r);
    for (const file of r.to_review ?? []) {
      const mine = findings.filter((f) => f.reviewer === r.name && f.file === file);
      // never cache a CRITICAL that was not verified — it must be re-judged
      if (mine.some((f) => f.severity === "CRITICAL" && f.verified !== true)) {
        skipped++;
        continue;
      }
      writeJson(entryPath(r, keyOf(r, rh, file)), { reviewer: r.name, file, stored_at: new Date().toISOString(), findings: mine });
      stored++;
    }
  }
  console.log(`[cache] stored ${stored} (reviewer,file) entries` + (skipped ? `, skipped ${skipped} with unverified CRITICAL` : ""));
} else {
  console.error("usage: cache.mjs split [--no-cache] | store [--only a,b]");
  process.exit(1);
}
