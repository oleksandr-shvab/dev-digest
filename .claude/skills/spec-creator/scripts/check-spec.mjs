#!/usr/bin/env node
// Mechanical self-check for a spec written by the spec-creator skill.
// Usage: node .claude/skills/spec-creator/scripts/check-spec.mjs <spec.md>
// Exit 0 when there are no errors (warnings allowed), 1 on errors, 2 on bad usage.
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const SECTIONS = [
  'Problem & Motivation',
  'Goals / Non-goals',
  'User stories',
  'Acceptance criteria (EARS)',
  'Edge cases',
  'Non-functional',
  'Inputs (provenance)',
  'Untrusted inputs',
  'Proposed improvements', // draft only
  '[NEEDS CLARIFICATION: …]',
];
const NFR_LINES = ['Performance', 'Security & privacy', 'Accessibility', 'Cost & LLM'];
const MODULES = ['server', 'client', 'reviewer-core', 'mcp-server'];
const VERIFY = ['unit', 'integration', 'e2e', 'manual'];
const MAX_ACS = 20;
const MAX_LINES = 400;
// Words that usually mean the spec is describing the how. Warnings only.
const HOW_WORDS =
  /\b(column|table|migration|drizzle|repository class|service class|component|useState|useEffect|hook|function|endpoint handler|zod schema|\w+\.(ts|tsx|sql))\b/i;

const path = process.argv[2];
if (!path) {
  console.error('usage: check-spec.mjs <spec.md>');
  process.exit(2);
}

const errors = [];
const warnings = [];
const text = readFileSync(path, 'utf8');
const lines = text.split('\n');

// --- location, file name, header
const rel = relative(process.cwd(), resolve(path)).split('\\').join('/');
const loc = rel.match(/^(?:([a-z-]+)\/)?specs\/(\d{2,})-[a-z0-9-]+\.md$/);
let expectedId = null;
if (!loc) {
  errors.push(`path "${rel}" is not <module>/specs/NN-slug.md or specs/NN-slug.md (run from the repo root)`);
} else if (loc[1] && !MODULES.includes(loc[1])) {
  errors.push(`"${loc[1]}/specs/" is not a feature-spec folder (allowed: ${MODULES.join(', ')}, or root specs/)`);
} else {
  expectedId = loc[1] ? `SPEC-${loc[1]}-${loc[2]}` : `SPEC-${loc[2]}`;
}

const header = lines[0].match(
  /^# Spec: (.+?)\s+\|\s+Spec ID: (\S+)\s+\|\s+Status: (\S+)\s*$/,
);
let status = null;
if (!header) {
  errors.push('line 1 must be "# Spec: <feature>   |   Spec ID: <id>   |   Status: <status>"');
} else {
  status = header[3];
  if (!['draft', 'approved', 'implemented'].includes(status)) {
    errors.push(`status "${status}" is not draft, approved or implemented`);
  }
  if (expectedId && header[2] !== expectedId) {
    errors.push(`Spec ID "${header[2]}" should be "${expectedId}" for this path`);
  }
}
if (!/^\*\*Affected modules:\*\*/m.test(text)) errors.push('missing "**Affected modules:**" line');
if (!/^\*\*Design sources:\*\*/m.test(text)) errors.push('missing "**Design sources:**" block');

// --- sections and their order
const headings = [];
lines.forEach((l, i) => {
  const m = l.match(/^## (.+?)\s*$/);
  if (m) headings.push({ name: m[1], line: i });
});
const names = headings.map((h) => h.name);
const needed = SECTIONS.filter((s) => s !== 'Proposed improvements' || status === 'draft');
for (const s of needed) if (!names.includes(s)) errors.push(`missing section "## ${s}"`);
for (const n of names) if (!SECTIONS.includes(n)) errors.push(`unexpected section "## ${n}"`);
const order = names.filter((n) => SECTIONS.includes(n)).map((n) => SECTIONS.indexOf(n));
if (order.some((v, i) => i > 0 && v < order[i - 1])) errors.push('sections are out of order');
if (status !== 'draft' && names.includes('Proposed improvements')) {
  errors.push(`an ${status} spec must not keep "## Proposed improvements" — fold proposals into ACs or Non-goals`);
}

function section(name) {
  const h = headings.findIndex((x) => x.name === name);
  if (h < 0) return [];
  const end = h + 1 < headings.length ? headings[h + 1].line : lines.length;
  return lines.slice(headings[h].line + 1, end).map((t, k) => ({ t, n: headings[h].line + 2 + k }));
}

// --- user stories
const stories = new Set();
for (const { t, n } of section('User stories')) {
  const m = t.match(/^- \*\*(US-\d+)\*\* (.*)$/);
  if (!m) {
    if (/^- /.test(t)) errors.push(`line ${n}: a story must start "- **US-n** As a …"`);
    continue;
  }
  stories.add(m[1]);
  if (!/^As an? .+, I want .+, so that .+/.test(m[2])) {
    errors.push(`line ${n}: ${m[1]} is not "As a <role>, I want <capability>, so that <benefit>"`);
  }
}
if (stories.size === 0) errors.push('no user stories with IDs (US-1, US-2…)');

// --- acceptance criteria
const AC_RE =
  /^- \*\*AC-(\d+)\*\* · (P[123]) · ((?:US-\d+|NFR)(?:,(?:US-\d+|NFR))*) · Verify: (\S+) — (.+)$/;
const acs = [];
const served = new Set();
for (const { t, n } of section('Acceptance criteria (EARS)')) {
  if (!/^- \*\*AC-/.test(t)) continue;
  const m = t.match(AC_RE);
  if (!m) {
    errors.push(`line ${n}: AC does not match "- **AC-n** · P1 · US-n · Verify: <kind> — <statement>"`);
    continue;
  }
  const [, num, , trace, verify, stmt] = m;
  acs.push(Number(num));
  const id = `AC-${num}`;
  for (const ref of trace.split(',')) {
    if (ref === 'NFR') continue;
    if (!stories.has(ref)) errors.push(`line ${n}: ${id} traces to unknown ${ref}`);
    served.add(ref);
  }
  if (!VERIFY.includes(verify)) errors.push(`line ${n}: ${id} Verify "${verify}" is not ${VERIFY.join(' | ')}`);
  if (!/^(The |WHEN |WHILE |IF |WHERE )/.test(stmt)) {
    errors.push(`line ${n}: ${id} does not open with an EARS keyword (The / WHEN / WHILE / IF / WHERE)`);
  }
  if (!/\bshall\b/.test(stmt)) errors.push(`line ${n}: ${id} has no "shall"`);
  if (/^IF /.test(stmt) && !/\bTHEN\b/.test(stmt)) errors.push(`line ${n}: ${id} is IF without THEN`);
  if ((stmt.match(/\bshall\b/g) || []).length > 1) warnings.push(`line ${n}: ${id} has more than one "shall" — two criteria in one?`);
  if (/\b(and\/or|fast|quickly|user-friendly|intuitive|appropriate|properly|etc\.?)\b/i.test(stmt)) {
    warnings.push(`line ${n}: ${id} uses an unmeasurable or ambiguous word`);
  }
}
if (acs.length === 0) errors.push('no acceptance criteria');
acs.forEach((v, i) => {
  if (v !== i + 1) errors.push(`AC numbering breaks at AC-${v} (expected AC-${i + 1})`);
});
if (acs.length > MAX_ACS) warnings.push(`${acs.length} ACs (> ${MAX_ACS}) — consider splitting the spec`);
for (const s of stories) if (!served.has(s)) errors.push(`${s} is not served by any AC`);

// --- edge cases point at ACs or are open
const acIds = new Set(acs.map((v) => `AC-${v}`));
for (const { t, n } of section('Edge cases')) {
  if (!/^- /.test(t)) continue;
  const refs = t.match(/AC-\d+/g) || [];
  if (refs.length === 0 && !t.includes('[NEEDS CLARIFICATION')) {
    errors.push(`line ${n}: edge case has no "→ AC-n" and is not marked [NEEDS CLARIFICATION]`);
  }
  for (const r of refs) if (!acIds.has(r)) errors.push(`line ${n}: edge case points at unknown ${r}`);
}

// --- non-functional: the four lines
const nfr = section('Non-functional').map((x) => x.t).join('\n');
for (const label of NFR_LINES) {
  const re = new RegExp(`^- \\*\\*${label.replace(/[&]/g, '\\$&')}\\*\\*`, 'm');
  if (!re.test(nfr)) errors.push(`Non-functional is missing "- **${label}** — …"`);
}

// --- proposals in a draft
for (const { t, n } of section('Proposed improvements')) {
  if (/^- /.test(t) && !/^- \*\*P-\d+\*\* /.test(t)) warnings.push(`line ${n}: proposal should start "- **P-n** "`);
}

// --- how-words, size
lines.forEach((l, i) => {
  if (l.startsWith('|') || l.startsWith('```')) return;
  const m = l.match(HOW_WORDS);
  if (m) warnings.push(`line ${i + 1}: "${m[0]}" — implementation detail? (judge: keep only if it is what the user observes)`);
});
if (lines.length > MAX_LINES) warnings.push(`${lines.length} lines (> ${MAX_LINES}) — consider splitting the spec`);

const open = (text.match(/\[NEEDS CLARIFICATION: (?!…\])/g) || []).length;
console.log(`${rel}: ${acs.length} ACs, ${stories.size} stories, ${open} NEEDS CLARIFICATION, status ${status ?? '?'}`);
for (const e of errors) console.log(`ERROR   ${e}`);
for (const w of warnings) console.log(`WARN    ${w}`);
console.log(errors.length ? `${errors.length} error(s)` : 'OK');
process.exit(errors.length ? 1 : 0);
