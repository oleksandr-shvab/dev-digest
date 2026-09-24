// Shared helpers for the pr-self-review scripts. Node >= 22, no dependencies.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function git(args, { allowFail = false, input, cwd } = {}) {
  const r = spawnSync("git", args, {
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
    input,
    cwd,
  });
  if (!allowFail && r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr || r.stdout}`);
  }
  return allowFail ? r : r.stdout;
}

export const ROOT = git(["rev-parse", "--show-toplevel"]).trim();
export const STATE = path.join(ROOT, ".claude/pr-self-review");
export const SKILL_DIR = path.join(ROOT, ".claude/skills/pr-self-review");
export const MANIFEST = path.join(STATE, "manifest.json");
export const PLAN = path.join(STATE, "plan.json");
export const REPORT = path.join(STATE, "last-report.json");
export const SUPPRESSIONS = path.join(STATE, "suppressions.json");

export const sha256 = (s) => createHash("sha256").update(s).digest("hex");

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

export function readDirJson(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .flatMap((f) => {
      const v = readJson(path.join(dir, f), []);
      return Array.isArray(v) ? v : [];
    });
}

// `*` = any chars but "/", `**` = anything (incl. "/"), `**/` = optional dirs,
// `{a,b}` = alternation.
const reCache = new Map();
// a "," is an alternation separator only inside an unclosed "{"
const inBrace = (glob, i) => glob.lastIndexOf("{", i) > glob.lastIndexOf("}", i);
export function globToRegExp(glob) {
  if (reCache.has(glob)) return reCache.get(glob);
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") {
          i++;
          re += "(?:.*/)?";
        } else re += ".*";
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (c === "{") re += "(?:";
    else if (c === "}") re += ")";
    else if (c === ",") re += inBrace(glob, i) ? "|" : ",";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  const rx = new RegExp(`^${re}$`);
  reCache.set(glob, rx);
  return rx;
}

export const matchAny = (p, globs = []) => globs.some((g) => globToRegExp(g).test(p));

export const loadRouting = () => readJson(path.join(SKILL_DIR, "routing.json"), {});

const MODULES = ["client", "server", "reviewer-core", "e2e"];
export const moduleOf = (p) => (MODULES.includes(p.split("/")[0]) ? p.split("/")[0] : "root");

export function resolveBase(explicit) {
  const candidates = explicit ? [explicit] : ["origin/main", "main"];
  for (const ref of candidates) {
    const r = git(["merge-base", "HEAD", ref], { allowFail: true });
    if (r.status === 0 && r.stdout.trim()) return { sha: r.stdout.trim(), ref };
  }
  throw new Error(
    `Cannot resolve a base: tried ${candidates.join(", ")}. Pass --base <ref>.`,
  );
}

// Everything that is "open": committed on the branch since the base, staged,
// unstaged and untracked. Returns files + a content-derived hash used for the
// gate's freshness check (report is only valid for exactly this state).
export function collectState(baseSha) {
  const routing = loadRouting();
  const excluded = (p) => matchAny(p.replace(/\/$/, ""), routing.exclude);

  const files = new Map();
  const tokens = git(["diff", "--name-status", "-M", "-z", "--no-color", baseSha]).split("\0");
  for (let i = 0; i < tokens.length; i++) {
    const status = tokens[i];
    if (!status) continue;
    if (status[0] === "R" || status[0] === "C") {
      const oldPath = tokens[++i];
      const p = tokens[++i];
      files.set(p, { path: p, oldPath, status: "R" });
    } else {
      const p = tokens[++i];
      files.set(p, { path: p, status: status[0] });
    }
  }
  const untracked = git(["ls-files", "-o", "--exclude-standard", "-z"]).split("\0").filter(Boolean);
  for (const p of untracked) if (!files.has(p)) files.set(p, { path: p, status: "A", untracked: true });

  // drop anything that is not a regular file (nested repos, symlinked dirs such as a
  // symlinked node_modules): `git hash-object` cannot hash them and they are not reviewable
  const isFile = (p) => {
    try {
      return fs.statSync(path.join(ROOT, p)).isFile();
    } catch {
      return false;
    }
  };
  const list = [...files.values()].filter(
    (f) => !excluded(f.path) && (f.status === "D" || isFile(f.path)),
  );

  const live = list.filter((f) => f.status !== "D");
  const hashes = live.length
    ? git(["hash-object", "--stdin-paths"], { input: live.map((f) => f.path).join("\n") + "\n" })
        .trim()
        .split("\n")
    : [];
  live.forEach((f, i) => (f.blob = hashes[i]));
  list.filter((f) => f.status === "D").forEach((f) => (f.blob = "deleted"));
  list.sort((a, b) => a.path.localeCompare(b.path));

  const diffHash = sha256(
    [baseSha, ...list.map((f) => `${f.status}\t${f.path}\t${f.blob}`)].join("\n"),
  );
  return { files: list, diffHash };
}

// Added lines of a single-file patch with their new-file line numbers.
export function addedLines(patch) {
  const out = [];
  let line = 0;
  let inHunk = false;
  for (const l of patch.split("\n")) {
    const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (m) {
      line = Number(m[1]);
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (l.startsWith("+")) out.push({ line: line++, text: l.slice(1) });
    else if (l.startsWith(" ")) line++;
  }
  return out;
}

export const findingId = (f) =>
  "F-" + sha256(`${f.reviewer}|${f.rule}|${f.file}|${f.line ?? 0}`).slice(0, 8);

export const SEV_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

// Findings the reviewer agents wrote (findings/*.json) with the verifier's
// verdicts (verdicts/*.json) applied. Rejected findings are dropped and
// reported back separately.
export function loadFresh() {
  const raw = readDirJson(path.join(STATE, "findings"));
  const verdicts = new Map(readDirJson(path.join(STATE, "verdicts")).map((v) => [v.id, v]));
  const findings = [];
  const rejected = [];
  const malformed = [];
  for (const f of raw) {
    if (!f || !f.file || !f.rule || !f.severity || !f.evidence || !f.reviewer) {
      malformed.push(f);
      continue;
    }
    const g = { ...f, severity: String(f.severity).toUpperCase(), in_diff: f.in_diff !== false };
    g.id = findingId(g);
    const v = verdicts.get(g.id);
    if (g.severity === "CRITICAL") {
      if (v?.verdict === "rejected") {
        rejected.push({ ...g, verification_note: v.note });
        continue;
      }
      if (v?.verdict === "confirmed") g.verified = true;
      else if (v?.verdict === "uncertain") {
        g.severity = "HIGH";
        g.downgraded = "uncertain after verification";
      } else g.verified = false;
    } else g.verified = true;
    findings.push(g);
  }
  return { findings, rejected, malformed };
}
