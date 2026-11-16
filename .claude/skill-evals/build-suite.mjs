#!/usr/bin/env node
// Build a `claude plugin eval` suite from a skill's evals/expected-findings.json.
//
//   node .claude/skill-evals/build-suite.mjs <skill>   → prints the built plugin dir
//
// Output: .claude/skill-evals/build/<skill>/
//   ├── <the skill's files, without evals/>   so the run under test cannot read the answers
//   └── evals/<case>/{prompt.md, case.yaml, graders/*.md, files/**, place-files.sh}
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const skill = process.argv[2];
if (!skill) {
  console.error('usage: build-suite.mjs <skill>');
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const skillDir = path.join(root, '.claude/skills', skill);
const evalsDir = path.join(skillDir, 'evals');
const spec = JSON.parse(fs.readFileSync(path.join(evalsDir, 'expected-findings.json'), 'utf8'));
const out = path.join(here, 'build', skill);

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(skillDir, out, {
  recursive: true,
  filter: (src) => path.relative(skillDir, src).split(path.sep)[0] !== 'evals',
});

const toRepoPath = (fixture) => {
  const [head, ...rest] = fixture.split('/');
  const mapped = spec.fixtureRoots?.[head];
  if (!mapped) throw new Error(`no fixtureRoots entry for "${head}" (${fixture})`);
  return path.posix.join(mapped, ...rest);
};

const graderFile = (statement) =>
  `---\ntype: llm\nfocus: trace\nweight: 1\n---\n\n${statement}\n`;

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

for (const c of spec.cases) {
  const caseDir = path.join(out, 'evals', c.id);
  fs.mkdirSync(path.join(caseDir, 'graders'), { recursive: true });

  const repoPaths = c.files.map(toRepoPath);
  for (const [i, f] of c.files.entries()) {
    const dest = path.join(caseDir, 'files', repoPaths[i]);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(evalsDir, 'fixtures', f), dest);
  }

  fs.writeFileSync(
    path.join(caseDir, 'prompt.md'),
    [
      '---',
      'tags: [skill-eval]',
      'max_turns: 30',
      'timeout_seconds: 900',
      'allowed_tools: [Read, Glob, Grep, Skill, Write]',
      '---',
      '',
      c.prompt,
      '',
      `Input files: ${repoPaths.join(', ')}`,
      '',
    ].join('\n'),
  );

  const expected = c.findings.map((f) => `  - ${f.severity} ${toRepoPath(f.file)}:${f.lines}: ${f.rule}`);
  const clean = (c.mustNotFlag ?? []).map((m) => `  - not flagged: ${toRepoPath(m.file)}`);
  fs.writeFileSync(
    path.join(caseDir, 'case.yaml'),
    [
      'schema_version: "1.1"',
      `name: ${c.id}`,
      'expected_outcome: |',
      `  ${spec.output} reports these planted layering problems:`,
      ...expected.map((l) => `  ${l}`),
      ...clean.map((l) => `  ${l}`),
      'context:',
      '  scaffold_script: place-files.sh',
      '',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(caseDir, 'place-files.sh'),
    '#!/usr/bin/env bash\nset -eu\ncp -R "$(dirname "$0")/files/." .\n',
    { mode: 0o755 },
  );

  const graders = [
    ...c.findings.map((f) => [`flags-${f.id}`, f.assertion]),
    ...(c.mustNotFlag ?? []).map((m) => [`not-flagged-${path.basename(m.file, '.ts')}`, m.assertion]),
    ...(c.extraChecks ?? []).map((s) => [slug(s), s]),
    ...(spec.commonChecks ?? []).map((s) => [slug(s), s]),
  ];
  graders.forEach(([name, statement], i) => {
    const n = String(i + 1).padStart(2, '0');
    fs.writeFileSync(path.join(caseDir, 'graders', `${n}-${name}.md`), graderFile(statement));
  });
}

console.log(out);
