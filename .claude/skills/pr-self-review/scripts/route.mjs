#!/usr/bin/env node
// Step 2: discover the skills that exist, match them to the changed files
// (routing.json) and write plan.json — one "reviewer" per skill.
import fs from "node:fs";
import path from "node:path";
import { ROOT, MANIFEST, PLAN, loadRouting, matchAny, readJson, writeJson } from "./lib.mjs";

const manifest = readJson(MANIFEST);
if (!manifest) {
  console.error("No manifest.json — run collect-diff.mjs first.");
  process.exit(1);
}
const routing = loadRouting();
const skillsDir = path.join(ROOT, ".claude/skills");

// --- discover skills + scope from the README catalog -----------------------
const scopes = {};
const readme = fs.existsSync(path.join(skillsDir, "README.md"))
  ? fs.readFileSync(path.join(skillsDir, "README.md"), "utf8")
  : "";
for (const m of readme.matchAll(/^\|\s*\[([^\]]+)\]\([^)]*\)\s*\|\s*([^|]+?)\s*\|/gm)) scopes[m[1]] = m[2];

const discovered = fs
  .readdirSync(skillsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(skillsDir, d.name, "SKILL.md")))
  .map((d) => d.name);

const candidates = manifest.files.filter((f) => f.status !== "D" && !f.binary);
const contentOf = (p) => {
  try {
    return fs.readFileSync(path.join(ROOT, p), "utf8");
  } catch {
    return "";
  }
};

const reviewers = new Map(); // name -> { files:Set, rules:Set, source }
const add = (name, file, ruleId, source) => {
  if (!reviewers.has(name)) reviewers.set(name, { files: new Set(), rules: new Set(), source });
  const r = reviewers.get(name);
  r.files.add(file);
  r.rules.add(ruleId);
};

const warnings = [];
for (const rule of routing.rules) {
  const rx = rule.content ? new RegExp(rule.content) : null;
  for (const f of candidates) {
    if (!matchAny(f.path, rule.match) || matchAny(f.path, rule.exclude)) continue;
    if (rx && !rx.test(contentOf(f.path))) continue;
    for (const s of rule.skills) add(s, f.path, rule.id, "rule");
  }
  for (const s of rule.skills) {
    if (!routing.reviewers?.[s] && !discovered.includes(s)) {
      warnings.push(`routing rule "${rule.id}" references missing skill "${s}"`);
    }
  }
}

// --- skills that no rule mentions: fall back to README scope ---------------
const mentioned = new Set(routing.rules.flatMap((r) => r.skills));
const unrouted = discovered.filter((s) => !mentioned.has(s) && !routing.not_reviewers.includes(s));
for (const s of unrouted) {
  const fb = routing.scope_fallback[scopes[s]];
  if (!fb) {
    warnings.push(`skill "${s}" has no routing rule and scope "${scopes[s] ?? "unknown"}" has no fallback — NOT run`);
    continue;
  }
  for (const f of candidates) {
    if (matchAny(f.path, fb.match) && !matchAny(f.path, fb.exclude)) add(s, f.path, `scope:${scopes[s]}`, "scope-fallback");
  }
}

// --- assemble --------------------------------------------------------------
const modulesOf = (files) => [...new Set(files.map((p) => manifest.files.find((f) => f.path === p).module))];
const insightsFor = (files) => {
  const out = [];
  for (const m of modulesOf(files)) {
    const p = m === "root" ? "insights.md" : `${m}/insights.md`;
    if (fs.existsSync(path.join(ROOT, p))) out.push(p);
  }
  return out;
};

const plan = {
  base: manifest.base,
  diff_hash: manifest.diff_hash,
  reviewers: [...reviewers.entries()]
    .map(([name, r]) => {
      const files = [...r.files].sort();
      const instructions =
        routing.reviewers?.[name]?.instructions ?? `.claude/skills/${name}/SKILL.md`;
      return {
        name,
        kind: routing.reviewers?.[name] ? "rules" : "skill",
        instructions,
        source: r.source,
        rules: [...r.rules],
        files,
        insights: insightsFor(files),
      };
    })
    .filter((r) => fs.existsSync(path.join(ROOT, r.instructions)))
    .sort((a, b) => a.name.localeCompare(b.name)),
  unrouted_skills: unrouted,
  not_reviewers: routing.not_reviewers,
  deterministic_only: candidates
    .map((f) => f.path)
    .filter((p) => ![...reviewers.values()].some((r) => r.files.has(p))),
  warnings,
};
writeJson(PLAN, plan);

console.log(`[route] ${plan.reviewers.length} reviewers`);
for (const r of plan.reviewers) {
  console.log(`  ${r.name.padEnd(28)} ${String(r.files.length).padStart(3)} files  (${r.source})`);
}
if (unrouted.length) console.log(`[route] UNROUTED skills (scope fallback used): ${unrouted.join(", ")}`);
if (warnings.length) warnings.forEach((w) => console.log(`[route] warning: ${w}`));
console.log(`[route] deterministic-only files: ${plan.deterministic_only.length}`);
