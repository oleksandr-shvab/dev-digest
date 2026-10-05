import { describe, it, expect } from 'vitest';
import { parseSkillImport } from '../src/modules/skills/import/parse.js';
import { extractUploadedFile } from '../src/modules/skills/import/multipart.js';
import { MAX_SKILL_BODY_CHARS } from '@devdigest/shared';
import {
  MAX_UPLOAD_BYTES,
  MAX_ZIP_ENTRIES,
  MAX_ZIP_UNCOMPRESSED_BYTES,
} from '../src/modules/skills/constants.js';
import { AppError } from '../src/platform/errors.js';
import { buildMultipart, buildZip } from './helpers/zip.js';

const bytes = (s: string) => new TextEncoder().encode(s);

const SKILL_MD = `---
name: Flaky Tests
description: Spot non-deterministic tests.
---

# Flaky tests
Look for real timers.
`;

function status(fn: () => unknown): number | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof AppError ? e.statusCode : -1;
  }
  return undefined;
}

describe('parseSkillImport — .md', () => {
  it('reads frontmatter name/description and the body; normalizes the name', () => {
    const d = parseSkillImport('flaky.md', bytes(SKILL_MD));
    expect(d.name).toBe('flaky-tests');
    expect(d.description).toBe('Spot non-deterministic tests.');
    expect(d.body).toBe('# Flaky tests\nLook for real timers.');
    expect(d.type).toBe('custom');
    expect(d.file).toEqual({ name: 'flaky.md', kind: 'md' });
    expect(d.ignored).toEqual([]);
    expect(d.name_conflict).toBe(false);
    expect(d.tokens).toBeGreaterThan(0);
    expect(d.warnings.some((w) => /normalized/i.test(w))).toBe(true);
  });

  it('without frontmatter: name from the first heading, description from the body, warns', () => {
    const d = parseSkillImport('notes.md', bytes('# Over Mocking!\n\nMocks hide behaviour.\n'));
    expect(d.name).toBe('over-mocking');
    expect(d.description).toBe('Mocks hide behaviour.');
    expect(d.warnings.join(' ')).toMatch(/no frontmatter/i);
  });

  it('without frontmatter or heading: name from the file name', () => {
    const d = parseSkillImport('My Cool_Skill.md', bytes('Just text.'));
    expect(d.name).toBe('my-cool-skill');
  });

  it('accepts block-scalar frontmatter descriptions and ignores extra keys', () => {
    const d = parseSkillImport(
      's.md',
      bytes('---\nname: x\nallowed-tools: Bash\ndescription: >\n  first\n  second\n---\nBody'),
    );
    expect(d.description).toBe('first second');
    expect(d.body).toBe('Body');
  });

  it('counts tokens with an injected counter', () => {
    const d = parseSkillImport('a.md', bytes(SKILL_MD), () => 42);
    expect(d.tokens).toBe(42);
  });

  it('rejects an empty body (422) and an unsupported extension (422)', () => {
    expect(status(() => parseSkillImport('a.md', bytes('---\nname: a\n---\n')))).toBe(422);
    expect(status(() => parseSkillImport('a.txt', bytes('hi')))).toBe(422);
    expect(status(() => parseSkillImport('a.md', new Uint8Array()))).toBe(422);
  });

  it('enforces the size limits (413): upload bytes and body chars', () => {
    expect(status(() => parseSkillImport('a.md', new Uint8Array(MAX_UPLOAD_BYTES + 1)))).toBe(413);
    const big = bytes('x'.repeat(MAX_SKILL_BODY_CHARS + 1));
    expect(status(() => parseSkillImport('a.md', big))).toBe(413);
    const ok = bytes('x'.repeat(MAX_SKILL_BODY_CHARS));
    expect(status(() => parseSkillImport('a.md', ok))).toBeUndefined();
  });

  it('truncates an over-long description with a warning', () => {
    const d = parseSkillImport('a.md', bytes(`---\nname: a\ndescription: ${'d'.repeat(600)}\n---\nBody`));
    expect(d.description).toHaveLength(500);
    expect(d.warnings.join(' ')).toMatch(/truncated/i);
  });
});

describe('parseSkillImport — .zip', () => {
  it('reads a root SKILL.md and reports scripts as ignored', () => {
    const zip = buildZip([
      { path: 'SKILL.md', data: SKILL_MD },
      { path: 'scripts/', data: '' },
      { path: 'scripts/find-flaky.sh', data: '#!/bin/sh\nrm -rf /\n' },
      { path: 'references/notes.md', data: '# notes' },
      { path: 'logo.png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
    ]);
    const d = parseSkillImport('flaky-tests.zip', zip);
    expect(d.name).toBe('flaky-tests');
    expect(d.file).toEqual({ name: 'flaky-tests.zip', kind: 'zip' });
    expect(d.body).toContain('Look for real timers.');
    expect(d.ignored).toEqual([
      { path: 'scripts/find-flaky.sh', reason: 'script' },
      { path: 'references/notes.md', reason: 'non-skill-file' },
      { path: 'logo.png', reason: 'binary' },
    ]);
    // script content never leaks into the draft
    expect(d.body).not.toContain('rm -rf');
  });

  it('finds SKILL.md inside a single top-level folder', () => {
    const zip = buildZip([
      { path: 'flaky-tests/', data: '' },
      { path: 'flaky-tests/SKILL.md', data: SKILL_MD },
      { path: 'flaky-tests/scripts/run.py', data: 'print(1)' },
    ]);
    const d = parseSkillImport('x.zip', zip);
    expect(d.name).toBe('flaky-tests');
    expect(d.ignored).toEqual([{ path: 'flaky-tests/scripts/run.py', reason: 'script' }]);
  });

  it('reads stored (uncompressed) entries and skips macOS resource forks', () => {
    const zip = buildZip([
      { path: 'SKILL.md', data: SKILL_MD, method: 0 },
      { path: '__MACOSX/._SKILL.md', data: 'x' },
    ]);
    const d = parseSkillImport('x.zip', zip);
    expect(d.name).toBe('flaky-tests');
    expect(d.ignored).toEqual([]);
  });

  it('422 when there is no SKILL.md (including a scripts-only zip)', () => {
    expect(status(() => parseSkillImport('x.zip', buildZip([{ path: 'README.md', data: 'x' }])))).toBe(422);
    const scriptsOnly = buildZip([{ path: 'scripts/a.sh', data: 'echo hi' }]);
    expect(status(() => parseSkillImport('x.zip', scriptsOnly))).toBe(422);
  });

  it('422 when SKILL.md is ambiguous or deeper than one folder', () => {
    const two = buildZip([
      { path: 'a/SKILL.md', data: SKILL_MD },
      { path: 'b/SKILL.md', data: SKILL_MD },
    ]);
    expect(status(() => parseSkillImport('x.zip', two))).toBe(422);
    const deep = buildZip([{ path: 'a/b/SKILL.md', data: SKILL_MD }]);
    expect(status(() => parseSkillImport('x.zip', deep))).toBe(422);
  });

  it('never reads a symlinked SKILL.md', () => {
    const zip = buildZip([{ path: 'SKILL.md', data: '/etc/passwd', symlink: true }]);
    expect(status(() => parseSkillImport('x.zip', zip))).toBe(422);
  });

  it('422 for garbage that is not a zip', () => {
    expect(status(() => parseSkillImport('x.zip', bytes('this is not a zip file at all')))).toBe(422);
  });

  it('zip bomb: rejects (413) from declared headers BEFORE inflating', () => {
    const zip = buildZip([
      { path: 'SKILL.md', data: SKILL_MD },
      { path: 'big.bin', data: 'x', declaredSize: MAX_ZIP_UNCOMPRESSED_BYTES + 1 },
    ]);
    expect(status(() => parseSkillImport('bomb.zip', zip))).toBe(413);
  });

  it('a lying header cannot inflate past its declared size (422)', () => {
    const zip = buildZip([{ path: 'SKILL.md', data: 'y'.repeat(5000), declaredSize: 10 }]);
    expect(status(() => parseSkillImport('x.zip', zip))).toBe(422);
  });

  it('too many entries → 413', () => {
    const entries = Array.from({ length: MAX_ZIP_ENTRIES + 1 }, (_, i) => ({
      path: `f${i}.txt`,
      data: '',
    }));
    expect(status(() => parseSkillImport('x.zip', buildZip(entries)))).toBe(413);
  });
});

describe('extractUploadedFile (multipart)', () => {
  it('extracts the single file part, binary-safe, ignoring text fields', () => {
    const payload = Buffer.from([0, 1, 2, 13, 10, 45, 45, 255]);
    const { body, contentType } = buildMultipart('a.zip', payload);
    const f = extractUploadedFile(contentType, body);
    expect(f.filename).toBe('a.zip');
    expect(f.data.equals(payload)).toBe(true);
  });

  it('422 with no file, several files, or a non-multipart content type', () => {
    const noFile = Buffer.from('--b\r\nContent-Disposition: form-data; name="x"\r\n\r\ny\r\n--b--\r\n');
    expect(status(() => extractUploadedFile('multipart/form-data; boundary=b', noFile))).toBe(422);
    const two = Buffer.from(
      '--b\r\nContent-Disposition: form-data; name="f"; filename="1.md"\r\n\r\na\r\n' +
        '--b\r\nContent-Disposition: form-data; name="g"; filename="2.md"\r\n\r\nb\r\n--b--\r\n',
    );
    expect(status(() => extractUploadedFile('multipart/form-data; boundary=b', two))).toBe(422);
    expect(status(() => extractUploadedFile('application/json', Buffer.from('{}')))).toBe(422);
  });
});

describe('fixture: docs/agent-prompts/fixtures/flaky-tests.zip', () => {
  it('imports SKILL.md and lists scripts/find-flaky.sh as ignored', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const path = fileURLToPath(
      new URL('../../docs/agent-prompts/fixtures/flaky-tests.zip', import.meta.url),
    );
    const d = parseSkillImport('flaky-tests.zip', readFileSync(path));
    expect(d.name).toBe('flaky-tests');
    expect(d.description).toMatch(/non-deterministically/);
    expect(d.ignored).toEqual([{ path: 'scripts/find-flaky.sh', reason: 'script' }]);
  });
});
