import type { SkillImportDraft } from '@devdigest/shared';
import { MAX_SKILL_BODY_CHARS } from '@devdigest/shared';
import { PayloadTooLargeError, ValidationError } from '../../../platform/errors.js';
import {
  DEFAULT_IMPORT_TYPE,
  MAX_UPLOAD_BYTES,
  MAX_ZIP_ENTRIES,
  MAX_ZIP_UNCOMPRESSED_BYTES,
  SCRIPT_EXTENSIONS,
  SKILL_FILE_NAME,
  TEXT_EXTENSIONS,
} from '../constants.js';
import { slugifySkillName } from '../helpers.js';
import { parseFrontmatter } from './frontmatter.js';
import { listZipEntries, readZipEntry, type ZipEntry } from './zip.js';

/**
 * Import parser — PURE: `(filename, bytes) → SkillImportDraft`. No filesystem,
 * no child_process, no network. Zip archives are read in memory; only `SKILL.md`
 * is inflated, every other entry is reported back in `ignored` and discarded.
 *
 * `name_conflict` is always `false` here — the service fills it in from the DB.
 */

const MAX_DESCRIPTION_CHARS = 500;

export type TokenCounter = (text: string) => number;

/** Fallback counter (≈4 chars/token) when the caller doesn't inject one. */
const approxTokens: TokenCounter = (text) => Math.ceil(text.length / 4);

type Ignored = SkillImportDraft['ignored'];

/** Strip any directory part from an uploaded file name. */
function baseName(filename: string): string {
  return filename.replaceAll('\\', '/').split('/').pop() ?? filename;
}

function extOf(path: string): string {
  const base = baseName(path);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

/** Classify a discarded zip entry. */
export function ignoredReason(path: string): Ignored[number]['reason'] {
  const ext = extOf(path);
  if (SCRIPT_EXTENSIONS.has(ext) || path.split('/').slice(0, -1).includes('scripts')) return 'script';
  if (ext === '' || TEXT_EXTENSIONS.has(ext)) return 'non-skill-file';
  return 'binary';
}

function firstHeading(body: string): string | undefined {
  const m = /^#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/m.exec(body);
  return m?.[1]?.trim() || undefined;
}

function firstParagraphLine(body: string): string | undefined {
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (t && !t.startsWith('#') && !t.startsWith('```') && !/^[-*_]{3,}$/.test(t)) return t;
  }
  return undefined;
}

interface TextDraft {
  name: string;
  description: string;
  body: string;
  warnings: string[];
}

/** Turn SKILL.md / .md text into name + description + body (+ warnings). */
function draftFromMarkdown(text: string, fallbackName: string): TextDraft {
  const warnings: string[] = [];
  const fm = parseFrontmatter(text);
  if (!fm.found) warnings.push('No frontmatter found — name and description were derived');
  const body = fm.body.trim();
  if (!body) throw new ValidationError('The skill has no body content');
  if (body.length > MAX_SKILL_BODY_CHARS) {
    throw new PayloadTooLargeError(
      `Skill body is too long (${body.length} > ${MAX_SKILL_BODY_CHARS} characters)`,
    );
  }

  const rawName = fm.data.name?.trim();
  let source = rawName;
  if (!source) {
    const heading = firstHeading(body);
    source = heading ?? fallbackName;
    warnings.push(
      `No name in frontmatter — derived from ${heading ? 'the first heading' : 'the file name'}`,
    );
  }
  const name = slugifySkillName(source);
  if (rawName && name !== rawName) warnings.push(`Name was normalized to "${name}"`);

  let description = fm.data.description?.trim() ?? '';
  if (!description) {
    description = firstParagraphLine(body) ?? '';
    warnings.push(
      description
        ? 'No description in frontmatter — derived from the body'
        : 'No description found — add one before saving',
    );
  }
  if (description.length > MAX_DESCRIPTION_CHARS) {
    description = description.slice(0, MAX_DESCRIPTION_CHARS).trimEnd();
    warnings.push(`Description was truncated to ${MAX_DESCRIPTION_CHARS} characters`);
  }
  return { name, description, body, warnings };
}

/** Pick the SKILL.md entry: root first, else one in a single top-level folder. */
function findSkillEntry(files: ZipEntry[]): ZipEntry {
  const root = files.filter((e) => e.path === SKILL_FILE_NAME);
  if (root.length === 1) return root[0]!;
  const nested = files.filter((e) => {
    const parts = e.path.split('/');
    return parts.length === 2 && parts[1] === SKILL_FILE_NAME;
  });
  if (nested.length === 1) return nested[0]!;
  if (nested.length > 1) {
    throw new ValidationError(`The zip contains several ${SKILL_FILE_NAME} files — expected exactly one`);
  }
  throw new ValidationError(`The zip does not contain a ${SKILL_FILE_NAME} at its root or in a single top-level folder`);
}

function parseZip(filename: string, bytes: Uint8Array, count: TokenCounter): SkillImportDraft {
  const all = listZipEntries(bytes, MAX_ZIP_ENTRIES);

  // Zip-bomb guard: judge the declared sizes from the headers BEFORE inflating.
  const declared = all.reduce((sum, e) => sum + e.uncompressedSize, 0);
  if (declared > MAX_ZIP_UNCOMPRESSED_BYTES) {
    throw new PayloadTooLargeError(
      `Zip expands to ${declared} bytes (limit ${MAX_ZIP_UNCOMPRESSED_BYTES})`,
    );
  }

  // Drop directories and macOS resource-fork noise; everything else is a file.
  const files = all.filter(
    (e) => !e.isDirectory && !e.path.startsWith('__MACOSX/') && baseName(e.path) !== '.DS_Store',
  );
  const skillEntry = findSkillEntry(files.filter((e) => !e.isSymlink));
  if (skillEntry.uncompressedSize > MAX_UPLOAD_BYTES) {
    throw new PayloadTooLargeError(`${SKILL_FILE_NAME} is too large`);
  }

  const text = readZipEntry(bytes, skillEntry).toString('utf8');
  const stem = baseName(filename).replace(/\.zip$/i, '');
  const draft = draftFromMarkdown(text, stem);

  const ignored: Ignored = files
    .filter((e) => e !== skillEntry)
    .map((e) => ({ path: e.path, reason: e.isSymlink ? ('non-skill-file' as const) : ignoredReason(e.path) }));

  return {
    name: draft.name,
    description: draft.description,
    type: DEFAULT_IMPORT_TYPE,
    body: draft.body,
    tokens: count(draft.body),
    file: { name: baseName(filename), kind: 'zip' },
    ignored,
    warnings: draft.warnings,
    name_conflict: false,
  };
}

/**
 * Parse an uploaded `.md` / `.zip` into an import draft.
 * Errors: 413 over the size limits, 422 unparseable / unsupported / no SKILL.md.
 */
export function parseSkillImport(
  filename: string,
  bytes: Uint8Array,
  countTokens: TokenCounter = approxTokens,
): SkillImportDraft {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new PayloadTooLargeError(`File is too large (limit ${MAX_UPLOAD_BYTES} bytes)`);
  }
  if (bytes.byteLength === 0) throw new ValidationError('The uploaded file is empty');

  const name = baseName(filename);
  const ext = extOf(name);
  if (ext === 'zip') return parseZip(name, bytes, countTokens);
  if (ext === 'md' || ext === 'markdown') {
    const text = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('utf8');
    const draft = draftFromMarkdown(text, name.replace(/\.(md|markdown)$/i, ''));
    return {
      name: draft.name,
      description: draft.description,
      type: DEFAULT_IMPORT_TYPE,
      body: draft.body,
      tokens: countTokens(draft.body),
      file: { name, kind: 'md' },
      ignored: [],
      warnings: draft.warnings,
      name_conflict: false,
    };
  }
  throw new ValidationError('Only .md and .zip files can be imported');
}
