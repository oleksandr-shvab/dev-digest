#!/usr/bin/env node
// Step 5: deterministic checks — no LLM involved. Writes checks.json.
import fs from "node:fs";
import path from "node:path";
import { ROOT, STATE, MANIFEST, addedLines, matchAny, readJson, writeJson } from "./lib.mjs";

const manifest = readJson(MANIFEST);
if (!manifest) {
  console.error("No manifest.json — run collect-diff.mjs first.");
  process.exit(1);
}

// Tunables
const MAX_FILES = 30;
const MAX_CHANGED_LINES = 1500;

const out = [];
const mk = (rule, severity, file, line, evidence, suggested_fix) =>
  out.push({
    reviewer: "deterministic", skill: "deterministic", file, line, severity,
    rule: `deterministic/${rule}`, evidence, suggested_fix,
    autofix: false, in_diff: true, verified: true,
  });

const files = manifest.files.filter((f) => !f.binary);
const live = files.filter((f) => f.status !== "D");
const patchOf = (f) => {
  try {
    return fs.readFileSync(path.join(ROOT, f.patch_file), "utf8");
  } catch {
    return "";
  }
};
const redact = (s) => s.slice(0, 4) + "…[redacted]";

// --- 1. secrets in added lines ----------------------------------------------
const SPECIFIC = [
  ["aws-access-key", /\bAKIA[0-9A-Z]{16}\b/],
  ["anthropic-key", /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ["openai-style-key", /\bsk-[A-Za-z0-9]{32,}\b/],
  ["github-token", /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ["github-pat", /\bgithub_pat_[A-Za-z0-9_]{50,}\b/],
  ["slack-token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["google-api-key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["private-key", /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/],
];
const GENERIC = /(?:api[_-]?key|secret|token|passwd|password)["']?\s*[:=]\s*["']([^"'\s]{16,})["']/i;
const PLACEHOLDER = /example|placeholder|changeme|your[_-]|xxx|dummy|fake|test|process\.env|<[^>]+>|\$\{/i;

for (const f of live) {
  const base = path.basename(f.path);
  if (/^\.env(\..+)?$/.test(base) && !/\.(example|sample|template)$/.test(base)) {
    mk("secret-env-file", "CRITICAL", f.path, 1, `env file added to the change set: ${f.path}`,
      "Remove it from the change set (git rm --cached / unstage) and keep only a .env.example.");
  }
  if (f.path.startsWith(".claude/skills/")) continue; // vendored skill docs hold fake "unsafe" samples
  const isTest = /\.test\.[jt]sx?$/.test(f.path) || f.path.includes("/test/");
  const isMd = f.path.endsWith(".md");
  for (const { line, text } of addedLines(patchOf(f))) {
    let hit = false;
    for (const [kind, rx] of SPECIFIC) {
      const m = rx.exec(text);
      if (m) {
        mk(`secret-${kind}`, "CRITICAL", f.path, line, `${kind} literal: ${redact(m[0])}`,
          "Remove the literal, rotate the credential (it is now in your working tree/history), read it from env/SecretsProvider.");
        hit = true;
        break;
      }
    }
    if (hit || isTest || isMd) continue;
    const g = GENERIC.exec(text);
    if (g && !PLACEHOLDER.test(g[1])) {
      mk("secret-generic-assignment", "HIGH", f.path, line, `hard-coded credential-looking value: ${redact(g[1])}`,
        "Load it from configuration/SecretsProvider instead of a literal.");
    }
  }
}

// --- 2. hand-edited applied migrations / schema without migration ------------
for (const f of files) {
  if (/^server\/src\/db\/migrations\/[^/]+\.sql$/.test(f.path) && f.status !== "A") {
    mk("applied-migration-edited", "CRITICAL", f.path, 1,
      `applied migration ${path.basename(f.path)} was ${f.status === "D" ? "deleted" : "modified"} (CLAUDE.md: never hand-edit an applied migration)`,
      "Revert the file and generate a new migration: `pnpm db:generate` in server/.");
  }
}
const schemaTouched = live.filter((f) => /^server\/src\/db\/schema(\.ts|\/)/.test(f.path));
const newMigration = files.some((f) => /^server\/src\/db\/migrations\/[^/]+\.sql$/.test(f.path) && f.status === "A");
if (schemaTouched.length && !newMigration) {
  mk("schema-without-migration", "HIGH", schemaTouched[0].path, 1,
    `schema changed (${schemaTouched.map((f) => f.path).join(", ")}) but no new migration is in the diff`,
    "Run `pnpm db:generate` in server/ and commit the generated SQL (skip only if the change is type/comment-only).");
}

// --- 3. destructive DB reset in scripts/CI -----------------------------------
const DOWN_V = /docker[ -]compose\s+down\b[^\n]*\s-v\b|docker\s+volume\s+rm\b[^\n]*devdigest_pgdata/;
for (const f of live) {
  if (!matchAny(f.path, ["scripts/**", ".github/**", "docker-compose.yml", "**/package.json"])) continue;
  for (const { line, text } of addedLines(patchOf(f))) {
    if (DOWN_V.test(text)) {
      mk("destructive-db-reset", "CRITICAL", f.path, line, `destroys the devdigest_pgdata volume: ${text.trim().slice(0, 120)}`,
        "Never reset the persistent volume from a script; use the hermetic e2e DB instead (see e2e/README.md).");
    }
  }
}

// --- 4. vendored code drift (only for files this change touches) -------------
const VENDOR = /^(server|client)\/src\/vendor\/(shared|ui)\/(.+)$/;
const seenPairs = new Set();
for (const f of files) {
  const m = VENDOR.exec(f.path);
  if (!m) continue;
  const pair = `${m[2]}/${m[3]}`;
  if (seenPairs.has(pair)) continue; // touched on both sides: report the pair once
  seenPairs.add(pair);
  const other = m[1] === "server" ? "client" : "server";
  const otherDir = path.join(ROOT, other, "src/vendor", m[2]);
  if (!fs.existsSync(otherDir)) continue; // e.g. `ui` only exists on the client side
  const counterpart = path.join(otherDir, m[3]);
  const rel = `${other}/src/vendor/${m[2]}/${m[3]}`;
  if (f.status === "D") {
    if (fs.existsSync(counterpart)) mk("vendor-drift", "HIGH", f.path, 1, `deleted here but ${rel} still exists`, "Delete/sync both copies.");
    continue;
  }
  if (!fs.existsSync(counterpart)) {
    mk("vendor-drift", "HIGH", f.path, 1, `no counterpart at ${rel}`, "Mirror the file into the other vendored copy.");
  } else if (fs.readFileSync(counterpart, "utf8") !== fs.readFileSync(path.join(ROOT, f.path), "utf8")) {
    mk("vendor-drift", "HIGH", f.path, 1, `differs from ${rel} (vendored copies have no sync script)`,
      "Apply the same change to both copies (or note the intended divergence in the PR).");
  }
}

// --- 5. logic changed without any test change --------------------------------
const isTestPath = (p) => /\.test\.[jt]sx?$/.test(p) || /^(server|reviewer-core)\/test\//.test(p);
const anyTest = (mod) => files.some((f) => f.module === mod && isTestPath(f.path));
const groups = [
  ["server", live.filter((f) => matchAny(f.path, ["server/src/modules/**/{service,repository,helpers,run-executor}*.ts", "server/src/modules/**/repository/**/*.ts", "server/src/platform/**/*.ts"]) && !isTestPath(f.path))],
  ["reviewer-core", live.filter((f) => f.path.startsWith("reviewer-core/src/") && !isTestPath(f.path))],
  ["client", live.filter((f) => matchAny(f.path, ["client/src/lib/**/*.ts", "client/src/**/helpers.ts", "client/src/**/hooks/**/*.ts"]) && !isTestPath(f.path))],
];
for (const [mod, changed] of groups) {
  if (changed.length && !anyTest(mod)) {
    mk("logic-without-tests", "MEDIUM", changed[0].path, 1,
      `${changed.length} logic file(s) changed in ${mod}/ (${changed.slice(0, 3).map((f) => path.basename(f.path)).join(", ")}${changed.length > 3 ? ", …" : ""}) and no test file changed`,
      `Add or update a test in ${mod === "client" ? "a colocated *.test.ts(x)" : mod + "/test/"} covering the new behavior.`);
  }
}

// --- 6. PR size ----------------------------------------------------------------
const changedLines = manifest.stats.added + manifest.stats.removed;
if (files.length > MAX_FILES || changedLines > MAX_CHANGED_LINES) {
  const per = {};
  for (const f of files) {
    per[f.module] ??= { files: 0, lines: 0 };
    per[f.module].files++;
    per[f.module].lines += f.added + f.removed;
  }
  mk("large-diff", "MEDIUM", files[0]?.path ?? "(repo)", 1,
    `${files.length} files / ${changedLines} changed lines (limits ${MAX_FILES} / ${MAX_CHANGED_LINES}); ` +
      Object.entries(per).map(([m, v]) => `${m}: ${v.files}f/${v.lines}l`).join(", "),
    "Split into smaller PRs along module boundaries (e.g. server / client / reviewer-core / docs+skills); big PRs get worse reviews.");
}

// --- 7. the gate's own configuration changed -----------------------------------
const gateFiles = files.filter((f) => matchAny(f.path, [".claude/pr-self-review/suppressions.json", ".claude/settings.json", ".claude/settings.local.json", ".claude/skills/pr-self-review/**"]));
if (gateFiles.length) {
  mk("gate-config-changed", "HIGH", gateFiles[0].path, 1,
    `self-review gate config changed: ${gateFiles.map((f) => f.path).slice(0, 4).join(", ")}${gateFiles.length > 4 ? ", …" : ""}`,
    "Have a human review changes to the gate itself (suppressions, hook, scripts, routing) before merge.");
}

writeJson(path.join(STATE, "checks.json"), out);
const by = out.reduce((a, f) => ((a[f.severity] = (a[f.severity] || 0) + 1), a), {});
console.log(`[checks] ${out.length} deterministic findings ${JSON.stringify(by)}`);
