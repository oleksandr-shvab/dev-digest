#!/usr/bin/env node
// Step 1: collect every open change (branch commits + staged + unstaged +
// untracked) vs. the base, write manifest.json, diff.patch and per-file
// patches/. `--hash-only` prints just the freshness hash.
import fs from "node:fs";
import path from "node:path";
import {
  STATE, MANIFEST, git, collectState, resolveBase, moduleOf, sha256, writeJson,
} from "./lib.mjs";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const base = resolveBase(opt("--base"));
const { files, diffHash } = collectState(base.sha);

if (args.includes("--hash-only")) {
  console.log(diffHash);
  process.exit(0);
}

const patchesDir = path.join(STATE, "patches");
fs.rmSync(patchesDir, { recursive: true, force: true });
fs.mkdirSync(patchesDir, { recursive: true });

let full = "";
for (const f of files) {
  let patch;
  if (f.untracked) {
    patch = git(["diff", "--no-index", "--no-color", "--", "/dev/null", f.path], { allowFail: true }).stdout;
  } else if (f.status === "R") {
    patch = git(["diff", "--no-color", "-M", base.sha, "--", f.oldPath, f.path]);
  } else {
    patch = git(["diff", "--no-color", base.sha, "--", f.path]);
  }
  f.binary = /^Binary files /m.test(patch) || /^GIT binary patch/m.test(patch);
  f.module = moduleOf(f.path);
  f.added = 0;
  f.removed = 0;
  for (const l of patch.split("\n")) {
    if (l.startsWith("+") && !l.startsWith("+++")) f.added++;
    else if (l.startsWith("-") && !l.startsWith("---")) f.removed++;
  }
  f.patch_sha = sha256(patch);
  f.patch_file = path.join(".claude/pr-self-review/patches", f.path.replaceAll("/", "__") + ".patch");
  fs.writeFileSync(path.join(patchesDir, f.path.replaceAll("/", "__") + ".patch"), patch);
  full += patch.endsWith("\n") ? patch : patch + "\n";
}
fs.writeFileSync(path.join(STATE, "diff.patch"), full);

const reviewable = files.filter((f) => f.status !== "D" && !f.binary);
const manifest = {
  generated_at: new Date().toISOString(),
  branch: git(["rev-parse", "--abbrev-ref", "HEAD"]).trim(),
  head_sha: git(["rev-parse", "HEAD"]).trim(),
  base: base.sha,
  base_ref: base.ref,
  diff_hash: diffHash,
  stats: {
    files: files.length,
    reviewable: reviewable.length,
    added: files.reduce((n, f) => n + f.added, 0),
    removed: files.reduce((n, f) => n + f.removed, 0),
    untracked: files.filter((f) => f.untracked).length,
  },
  files,
};
writeJson(MANIFEST, manifest);

const byModule = {};
for (const f of files) byModule[f.module] = (byModule[f.module] || 0) + 1;
console.log(
  `[collect] ${manifest.branch} vs ${base.ref} (${base.sha.slice(0, 7)}): ` +
    `${files.length} files (+${manifest.stats.added}/-${manifest.stats.removed}), ` +
    `${manifest.stats.untracked} untracked; ` +
    Object.entries(byModule).map(([m, n]) => `${m}=${n}`).join(" ") +
    `\n[collect] diff_hash ${diffHash.slice(0, 12)}`,
);
