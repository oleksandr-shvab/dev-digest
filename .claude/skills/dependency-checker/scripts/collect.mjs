#!/usr/bin/env node
/**
 * Collect dependency facts for the dependency-checker skill. Read-only: it never installs,
 * updates or removes anything and makes no network calls. Prints one JSON document.
 *
 *   node .claude/skills/dependency-checker/scripts/collect.mjs [--root <dir>] [--top <n>] [--no-size]
 *
 * What it finds, per package (any dir with a package.json, up to two levels below the root):
 *   declared deps + installed version + installed size, imports actually used in source,
 *   declared-but-unused, imported-but-undeclared, lockfiles. Across packages: internal edges
 *   (tsconfig path aliases and relative imports that leave a package), vendored copies,
 *   version drift, overlapping libraries.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (argv[i + 1] ?? fallback);
};
const root = path.resolve(opt('root', process.cwd()));
const TOP = Number(opt('top', 8));
const WITH_SIZE = !argv.includes('--no-size');

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'out', 'coverage', '.turbo',
  'clones', 'playwright-report', 'test-results', '.pnpm-store',
  'fixtures', '__fixtures__', '__snapshots__', // test data, not real imports
]);
const TEST_PATH = /(?:^|[\\/])(?:test|tests|__tests__)[\\/]|\.(?:test|spec)\.[cm]?[jt]sx?$/;
const SRC_EXT = /\.(?:[cm]?[jt]sx?)$/;
const BUILTINS = new Set(builtinModules);
const LOCKFILES = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock'];
const OVERLAP_GROUPS = [
  ['moment', 'dayjs', 'date-fns', 'luxon'],
  ['lodash', 'underscore', 'ramda'],
  ['axios', 'node-fetch', 'got', 'undici', 'ky'],
  ['jest', 'vitest', 'mocha'],
  ['uuid', 'nanoid', 'cuid'],
  ['winston', 'pino', 'bunyan'],
  ['zod', 'yup', 'joi', 'valibot'],
];

const rel = (p) => path.relative(root, p) || '.';
const safeReaddir = (dir) => {
  try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
};
const readJson = (file) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
};

/** JSON with comments and trailing commas (tsconfig). Strings are tracked so `"@/*"` survives. */
function stripJsonc(text) {
  let out = '';
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (inStr) {
      out += c;
      if (c === '\\') out += text[++i] ?? '';
      else if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
      out += c;
    } else if (c === '/' && n === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && n === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
    } else {
      out += c;
    }
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

// ---------- packages ----------------------------------------------------------------------------
function findPackageDirs() {
  const found = [];
  const walk = (dir, depth) => {
    if (fs.existsSync(path.join(dir, 'package.json'))) found.push(dir);
    if (depth >= 2) return;
    for (const e of safeReaddir(dir)) {
      if (!e.isDirectory() || SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      const child = path.join(dir, e.name);
      if (fs.existsSync(path.join(child, '.git'))) continue; // a nested clone, not part of this repo
      walk(child, depth + 1);
    }
  };
  walk(root, 0);
  return found;
}

const pkgDirs = findPackageDirs();
const pkgDirSet = new Set(pkgDirs);
const packages = pkgDirs.map((dir) => {
  const json = readJson(path.join(dir, 'package.json')) ?? {};
  return { dir, json, name: json.name ?? rel(dir) };
});
const ownerOf = (abs) =>
  packages
    .filter((p) => abs === p.dir || abs.startsWith(p.dir + path.sep))
    .sort((a, b) => b.dir.length - a.dir.length)[0] ?? null;

// ---------- imports -----------------------------------------------------------------------------
// The character before `import`/`require` must not be a quote or backtick: that would be code
// quoted inside a string (test samples, scaffolding templates), not a real import.
const IMPORT_RE =
  /(?:^|[^\w$.'"`])(?:(?:import|export)\s+(?:type\s+)?(?:[^'";`]*?\sfrom\s*)?['"]([^'"\n]+)['"]|import\(\s*['"]([^'"\n]+)['"]\s*\)|require\(\s*['"]([^'"\n]+)['"]\s*\))/g;

/** Yield real import specifiers of one file, skipping comments and template-literal text. */
function* importsOf(text) {
  let line = 1;
  let last = 0;
  let inTemplate = false;
  for (const m of text.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (!spec) continue;
    const at = m.index + (m[0].length - m[0].trimStart().length);
    for (let i = last; i < at; i++) {
      const c = text.charCodeAt(i);
      if (c === 10) line++;
      else if (c === 96 && text.charCodeAt(i - 1) !== 92) inTemplate = !inTemplate;
    }
    last = at;
    if (inTemplate) continue;
    const lineHead = text.slice(text.lastIndexOf('\n', at - 1) + 1, at + 1);
    if (/^\s*(?:\/\/|\*|\/\*)/.test(lineHead) || lineHead.includes('//')) continue;
    yield { spec, line };
  }
}

function* walkFiles(dir) {
  for (const e of safeReaddir(dir)) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || pkgDirSet.has(p)) continue;
      yield* walkFiles(p);
    } else if (e.isFile() && SRC_EXT.test(e.name)) {
      yield p;
    }
  }
}

function loadAliases(dir) {
  const file = path.join(dir, 'tsconfig.json');
  if (!fs.existsSync(file)) return [];
  let cfg;
  try { cfg = JSON.parse(stripJsonc(fs.readFileSync(file, 'utf8'))); } catch { return []; }
  const co = cfg.compilerOptions ?? {};
  const base = path.resolve(dir, co.baseUrl ?? '.');
  return Object.entries(co.paths ?? {}).map(([key, targets]) => {
    const wildcard = key.endsWith('/*');
    return {
      key,
      prefix: wildcard ? key.slice(0, -1) : key,
      wildcard,
      target: path.resolve(base, String(targets[0]).replace(/\/\*$/, '')),
    };
  });
}

const packageName = (spec) => {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
};

const edges = new Map();
function addEdge(from, to, kind, alias, publicEntry, example, isTest) {
  const key = [from, to, kind, alias ?? ''].join('|');
  const e = edges.get(key) ?? { from, to, kind, alias: alias ?? null, publicEntry, count: 0, testCount: 0, examples: [] };
  e.count++;
  if (isTest) e.testCount++;
  if (e.examples.length < 3) e.examples.push(example);
  edges.set(key, e);
}

function scanPackage(p, declaredNames) {
  const aliases = loadAliases(p.dir);
  const used = new Map();
  const localAlias = new Map();
  const quoted = new Map();
  const foreignDirs = new Set();
  let hasTs = false;
  for (const file of walkFiles(p.dir)) {
    let text;
    try {
      if (fs.statSync(file).size > 1_000_000) continue;
      text = fs.readFileSync(file, 'utf8');
    } catch { continue; }
    if (/\.[cm]?tsx?$/.test(file)) hasTs = true;
    const isTest = TEST_PATH.test(rel(file));
    for (const name of declaredNames) {
      if (!quoted.has(name) && (text.includes(`'${name}'`) || text.includes(`"${name}"`) || text.includes(`\`${name}\``))) {
        quoted.set(name, rel(file));
      }
    }
    for (const { spec, line } of importsOf(text)) {
      const at = `${rel(file)}:${line}`;

      if (spec.startsWith('.')) {
        const target = path.resolve(path.dirname(file), spec);
        const owner = ownerOf(target);
        if (owner && owner.dir !== p.dir) addEdge(p.name, owner.name, 'relative', null, false, `${at} → ${spec}`, isTest);
        else if (!owner) addEdge(p.name, rel(target), 'relative-outside-packages', null, false, `${at} → ${spec}`, isTest);
        continue;
      }
      if (spec.startsWith('/') || spec.startsWith('#') || spec.includes(':')) continue;

      // An alias that points into node_modules (e.g. "zod": ["./node_modules/zod/..."]) only pins
      // where an npm package resolves from, so the import still counts as using that package.
      const hit = aliases
        .filter((a) => (a.wildcard ? spec.startsWith(a.prefix) : spec === a.key))
        .filter((a) => !a.target.includes(`${path.sep}node_modules${path.sep}`) && !a.target.endsWith(`${path.sep}node_modules`))
        .sort((a, b) => b.prefix.length - a.prefix.length)[0];
      if (hit) {
        const owner = ownerOf(hit.target);
        if (owner && owner.dir !== p.dir) {
          addEdge(p.name, owner.name, 'alias', hit.key, !hit.wildcard, `${at} → ${spec}`, isTest);
          foreignDirs.add(hit.target);
        } else {
          const k = `${hit.key} → ${rel(hit.target)}`;
          localAlias.set(k, (localAlias.get(k) ?? 0) + 1);
        }
        continue;
      }

      const name = packageName(spec);
      if (BUILTINS.has(name)) { used.set('node:builtin', (used.get('node:builtin') ?? 0) + 1); continue; }
      const u = used.get(name) ?? { count: 0, example: at };
      u.count = (u.count ?? 0) + 1;
      used.set(name, u);
    }
  }
  return { aliases, used, localAlias, quoted, foreignDirs, hasTs };
}

/** External package names imported by code under `dir` (code this package pulls in via an alias). */
function externalsUnder(dir) {
  const names = new Set();
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of safeReaddir(d)) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) stack.push(f); continue; }
      if (!e.isFile() || !SRC_EXT.test(e.name)) continue;
      let text;
      try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
      for (const { spec } of importsOf(text)) {
        if (spec.startsWith('.') || spec.startsWith('/') || spec.includes(':')) continue;
        const n = packageName(spec);
        if (!BUILTINS.has(n)) names.add(n);
      }
    }
  }
  return names;
}

// ---------- sizes -------------------------------------------------------------------------------
const sizeCache = new Map();
function dirBytes(real) {
  if (sizeCache.has(real)) return sizeCache.get(real);
  let bytes = 0;
  let files = 0;
  const stack = [real];
  while (stack.length) {
    const dir = stack.pop();
    for (const e of safeReaddir(dir)) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'node_modules') stack.push(p);
      } else if (e.isFile()) {
        try { bytes += fs.statSync(p).size; files++; } catch { /* ignore */ }
      }
    }
  }
  const r = { bytes, files };
  sizeCache.set(real, r);
  return r;
}

function installedInfo(dir, name) {
  try {
    const real = fs.realpathSync(path.join(dir, 'node_modules', name));
    const json = readJson(path.join(real, 'package.json')) ?? {};
    const size = WITH_SIZE ? dirBytes(real) : { bytes: null, files: null };
    return { installedVersion: json.version ?? null, bins: Object.keys(typeof json.bin === 'object' ? json.bin : {}), peers: Object.keys(json.peerDependencies ?? {}), ...size };
  } catch {
    return { installedVersion: null, bins: [], peers: [], bytes: null, files: null };
  }
}

function nodeModulesTotal(dir) {
  const nm = path.join(dir, 'node_modules');
  if (!fs.existsSync(nm)) return { installed: false, bytes: null, method: null };
  if (!WITH_SIZE) return { installed: true, bytes: null, method: null };
  for (const flags of [['-sk', '--apparent-size'], ['-sk']]) {
    try {
      const out = execFileSync('du', [...flags, nm], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      return { installed: true, bytes: Number(out.split(/\s/)[0]) * 1024, method: `du ${flags.join(' ')}` };
    } catch { /* try the next flag set */ }
  }
  return { installed: true, bytes: null, method: null };
}

// ---------- per-package analysis ----------------------------------------------------------------
const SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const typesTarget = (name) => {
  const rest = name.slice('@types/'.length);
  return rest.includes('__') ? `@${rest.replace('__', '/')}` : rest;
};

const TOOLCHAIN = new Set(['typescript', 'tsx', 'ts-node']);

const report = packages.map((p) => {
  const declared = new Map();
  for (const section of SECTIONS) {
    for (const [name, range] of Object.entries(p.json[section] ?? {})) {
      if (!declared.has(name)) declared.set(name, { name, section, range });
    }
  }
  const { used, localAlias, quoted, foreignDirs, hasTs } = scanPackage(p, [...declared.keys()]);
  const foreignUsed = new Set([...foreignDirs].flatMap((d) => [...externalsUnder(d)]));
  const scriptsBlob = JSON.stringify(p.json.scripts ?? {});
  const deps = [...declared.values()].map((d) => ({ ...d, ...installedInfo(p.dir, d.name) }));
  const peerOf = (name) => deps.filter((d) => d.name !== name && d.peers.includes(name)).map((d) => d.name);
  const isUsed = (d) =>
    used.has(d.name) ||
    (d.name === '@types/node' && (hasTs || used.has('node:builtin'))) ||
    (TOOLCHAIN.has(d.name) && hasTs) ||
    (d.name.startsWith('@types/') && used.has(typesTarget(d.name)));

  const unused = deps
    .filter((d) => d.section !== 'peerDependencies' && !isUsed(d))
    .map((d) => {
      const inScripts = [d.name, ...d.bins].some((n) => scriptsBlob.includes(n));
      const reasons = [];
      if (inScripts) reasons.push('named in a package.json script');
      if (quoted.has(d.name)) reasons.push(`quoted as a string in ${quoted.get(d.name)}`);
      if (peerOf(d.name).length) reasons.push(`peer dependency of ${peerOf(d.name).join(', ')}`);
      if (foreignUsed.has(d.name)) reasons.push('imported by code this package pulls in through a path alias');
      return {
        name: d.name, section: d.section, range: d.range, bytes: d.bytes,
        confidence: d.section === 'dependencies' && reasons.length === 0 && !d.name.startsWith('@types/') ? 'medium' : 'low',
        mayStillBeNeeded: reasons,
      };
    });
  const phantom = [...used.entries()]
    .filter(([n]) => n !== 'node:builtin' && !declared.has(n) && !n.startsWith('@types/'))
    .map(([name, u]) => ({ name, count: u.count, example: u.example }));

  const lockfiles = LOCKFILES.filter((f) => fs.existsSync(path.join(p.dir, f)));
  return {
    name: p.name,
    dir: rel(p.dir),
    packageManager: p.json.packageManager ?? null,
    lockfiles,
    counts: Object.fromEntries(SECTIONS.map((s) => [s, Object.keys(p.json[s] ?? {}).length])),
    nodeModules: nodeModulesTotal(p.dir),
    deps: deps.map(({ peers, bins, ...d }) => d),
    topBySize: [...deps].filter((d) => d.bytes != null).sort((a, b) => b.bytes - a.bytes).slice(0, TOP)
      .map(({ name, section, installedVersion, bytes }) => ({ name, section, installedVersion, bytes })),
    unused,
    phantom,
    localAliases: [...localAlias.entries()].map(([alias, count]) => ({ alias, count })),
  };
});

// ---------- cross-package checks ----------------------------------------------------------------
const drift = [];
const byName = new Map();
for (const r of report) {
  for (const d of r.deps) byName.set(d.name, [...(byName.get(d.name) ?? []), { package: r.name, section: d.section, range: d.range, installed: d.installedVersion }]);
}
for (const [name, uses] of byName) {
  if (new Set(uses.map((u) => u.range)).size > 1) {
    const majors = new Set(uses.map((u) => (u.range.match(/(\d+)\./) ?? [])[1] ?? u.range));
    drift.push({ name, majorDiffers: majors.size > 1, uses });
  }
}

const overlaps = OVERLAP_GROUPS.map((group) => ({
  group,
  present: group.filter((n) => byName.has(n)).map((n) => ({ name: n, in: byName.get(n).map((u) => u.package) })),
})).filter((o) => o.present.length > 1);

const lockfileIssues = report.flatMap((r) => {
  const issues = [];
  if (r.lockfiles.length > 1) issues.push({ package: r.name, issue: 'multiple-lockfiles', lockfiles: r.lockfiles });
  if (r.lockfiles.length === 0) issues.push({ package: r.name, issue: 'no-lockfile' });
  return issues;
});

function vendoredCopies() {
  const groups = new Map();
  for (const p of packages) {
    const vendorDir = path.join(p.dir, 'src', 'vendor');
    for (const e of safeReaddir(vendorDir)) {
      if (!e.isDirectory()) continue;
      const files = new Map();
      const stack = [path.join(vendorDir, e.name)];
      while (stack.length && files.size < 2000) {
        const dir = stack.pop();
        for (const f of safeReaddir(dir)) {
          const abs = path.join(dir, f.name);
          if (f.isDirectory()) stack.push(abs);
          else if (f.isFile()) files.set(path.relative(path.join(vendorDir, e.name), abs), crypto.createHash('sha1').update(fs.readFileSync(abs)).digest('hex'));
        }
      }
      groups.set(e.name, [...(groups.get(e.name) ?? []), { package: p.name, dir: rel(path.join(vendorDir, e.name)), files }]);
    }
  }
  return [...groups.entries()].filter(([, copies]) => copies.length > 1).map(([name, copies]) => {
    const [a, ...rest] = copies;
    return {
      name,
      copies: copies.map((c) => ({ package: c.package, dir: c.dir, files: c.files.size })),
      comparedTo: a.package,
      differences: rest.map((c) => ({
        package: c.package,
        onlyHere: [...c.files.keys()].filter((k) => !a.files.has(k)),
        onlyInFirst: [...a.files.keys()].filter((k) => !c.files.has(k)),
        differing: [...c.files.keys()].filter((k) => a.files.has(k) && a.files.get(k) !== c.files.get(k)),
      })),
    };
  });
}

const rootJson = readJson(path.join(root, 'package.json')) ?? {};
const pnpmWs = path.join(root, 'pnpm-workspace.yaml');
const workspace = {
  declared: Boolean(rootJson.workspaces) || (fs.existsSync(pnpmWs) && /^packages\s*:/m.test(fs.readFileSync(pnpmWs, 'utf8'))),
  note: 'Cross-package code goes through tsconfig path aliases / relative imports unless declared is true.',
};

const out = {
  root,
  generatedAt: new Date().toISOString(),
  workspace,
  packages: report,
  internalEdges: [...edges.values()].map(({ testCount, ...e }) => ({ ...e, testOnly: testCount === e.count })).sort((a, b) => b.count - a.count),
  vendoredCopies: vendoredCopies(),
  drift,
  overlaps,
  lockfileIssues,
  limits: [
    'Sizes are apparent file bytes of each declared package, excluding its own nested node_modules and its dependencies; they are not bundle sizes.',
    'Unused/undeclared detection is static: dynamic requires, config strings and CLI-only tools can be false positives.',
    'No network access: outdated versions and known vulnerabilities are not checked.',
    WITH_SIZE ? 'Packages without node_modules report null sizes.' : 'Sizes skipped (--no-size).',
  ],
};
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
