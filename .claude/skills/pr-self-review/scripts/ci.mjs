#!/usr/bin/env node
// Step 6: run the same checks CI runs for every touched module (mirrors
// .github/workflows/{client,server-unit,reviewer-core}.yml). Integration tests
// (`*.it.test.ts`, testcontainers) and e2e are NOT run locally.
//   --typecheck-only   only the typecheck step of each module (used by --fast)
//   --skip             record "skipped" and exit (used by --no-ci)
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { ROOT, STATE, MANIFEST, readJson, writeJson } from "./lib.mjs";

const args = process.argv.slice(2);
const mode = args.includes("--skip") ? "skipped" : args.includes("--typecheck-only") ? "typecheck-only" : "full";

const STEPS = {
  client: [
    ["typecheck", "pnpm", ["typecheck"]],
    ["unit-tests", "pnpm", ["test"]],
  ],
  server: [
    ["typecheck", "pnpm", ["typecheck"]],
    ["unit-tests", "pnpm", ["exec", "vitest", "run", "--exclude", "**/*.it.test.ts"]],
  ],
  "reviewer-core": [
    ["typecheck", "npm", ["run", "typecheck"]],
    ["unit-tests", "npm", ["test"]],
  ],
  e2e: [["typecheck", "npm", ["run", "typecheck"]]],
};
// server consumes reviewer-core through a tsconfig path alias, and CI runs
// server-unit on reviewer-core changes too.
const ALSO = { "reviewer-core": ["server"] };
// typecheck of these is nice-to-have: missing deps must not downgrade the report to "partial"
const OPTIONAL = new Set(["e2e"]);
// pnpm >= 10 may run an implicit `pnpm install` before any script when it thinks
// node_modules is outdated. A local check must never mutate the user's dependencies.
const NO_INSTALL = { npm_config_verify_deps_before_run: "false", NPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: "false" };
const TIMEOUT_MS = 10 * 60 * 1000;

const manifest = readJson(MANIFEST);
if (!manifest) {
  console.error("No manifest.json — run collect-diff.mjs first.");
  process.exit(1);
}

const result = { mode, results: [], findings: [] };
const done = () => {
  writeJson(path.join(STATE, "ci.json"), result);
  console.log(`[ci] mode=${mode} ` + result.results.map((r) => `${r.module}:${r.step}=${r.status}`).join(" "));
};
if (mode === "skipped") {
  done();
  process.exit(0);
}

const touched = new Set(
  manifest.files
    .filter((f) => f.module !== "root" && !f.path.endsWith(".md"))
    .map((f) => f.module),
);
for (const m of [...touched]) for (const d of ALSO[m] ?? []) touched.add(d);

const finding = (module, step, severity, rule, evidence, fix) =>
  result.findings.push({
    reviewer: "ci", skill: "ci", file: `${module}/`, line: 1, severity,
    rule: `ci/${module}-${rule}`, evidence, suggested_fix: fix, autofix: false,
    in_diff: true, verified: true,
  });

function run(cmd, cmdArgs, cwd) {
  return new Promise((resolve) => {
    const started = Date.now();
    const p = spawn(cmd, cmdArgs, { cwd, env: { ...process.env, CI: "1", FORCE_COLOR: "0", ...NO_INSTALL } });
    let buf = "";
    const keep = (d) => (buf = (buf + d).slice(-20000));
    p.stdout.on("data", keep);
    p.stderr.on("data", keep);
    const timer = setTimeout(() => p.kill("SIGKILL"), TIMEOUT_MS);
    p.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, ms: Date.now() - started, tail: String(e) });
    });
    p.on("close", (code, sig) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, ms: Date.now() - started, tail: sig ? `killed by ${sig} (timeout?)\n${buf}` : buf });
    });
  });
}

await Promise.all(
  [...touched].filter((m) => STEPS[m]).map(async (module) => {
    const cwd = path.join(ROOT, module);
    if (!fs.existsSync(path.join(cwd, "node_modules"))) {
      result.results.push({ module, step: "all", status: "skipped", optional: OPTIONAL.has(module) });
      finding(module, "all", "INFO", "deps-missing", `node_modules missing in ${module}/ — CI checks NOT run locally`,
        `Install deps (cd ${module} && ${module === "e2e" || module === "reviewer-core" ? "npm ci" : "pnpm install"}) and re-run.`);
      return;
    }
    for (const [step, cmd, cmdArgs] of STEPS[module]) {
      if (mode === "typecheck-only" && step !== "typecheck") continue;
      const r = await run(cmd, cmdArgs, cwd);
      result.results.push({ module, step, status: r.ok ? "pass" : "fail", ms: r.ms });
      if (!r.ok) {
        const tail = r.tail.trim().split("\n").slice(-25).join("\n");
        finding(module, step, "CRITICAL", `${step}-failed`,
          `\`${cmd} ${cmdArgs.join(" ")}\` failed in ${module}/ (CI would fail):\n${tail}`,
          `Fix the failure locally: cd ${module} && ${cmd} ${cmdArgs.join(" ")}`);
        break; // no point running tests on top of a failing typecheck
      }
    }
  }),
);
result.results.sort((a, b) => (a.module + a.step).localeCompare(b.module + b.step));
done();
