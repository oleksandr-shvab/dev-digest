import type { GitTreeEntry } from '@devdigest/shared';
import {
  CODE_EXCERPT_MAX_CHARS,
  CODE_EXCERPT_MAX_LINES,
  CONFIG_FILE_MAX_CHARS,
  CONTEXT_FILES_MAX,
  MAX_PROMPT_CHARS,
  OUTLINE_DIRS_MAX,
  README_MAX_CHARS,
} from './constants.js';

/**
 * Pure prompt-input helpers over a git tree and already-read blobs. Secret
 * paths are filtered BEFORE any blob is read (AC-30).
 */

export type PromptFileKind = 'readme' | 'config' | 'code';

/** A file chosen for the prompt, still unread. */
export interface PromptFileRef {
  path: string;
  blob: string;
  kind: PromptFileKind;
}

/** A file ready to be placed in its own `<untrusted>` block. */
export interface PromptFile {
  path: string;
  text: string;
}

const KEY_FILE_EXTENSIONS = ['.pem', '.key', '.p12', '.pfx'];
const KEY_FILE_PREFIXES = ['id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519'];
const ENV_TEMPLATES = new Set(['.env.example', '.env.sample']);

const MANIFESTS = new Set([
  'package.json',
  'pnpm-workspace.yaml',
  'pyproject.toml',
  'requirements.txt',
  'go.mod',
  'Cargo.toml',
  'Gemfile',
  'pom.xml',
  'build.gradle',
  'Makefile',
  'Procfile',
  'Dockerfile',
]);
const COMPOSE_FILES = new Set([
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
]);

const REGULAR_FILE_MODES = new Set(['100644', '100755']);

function basenameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Paths whose content must never reach a prompt: env files, private keys, `.git`, `node_modules`. */
export function isSecretPath(path: string): boolean {
  const segments = path.split('/');
  if (segments.some((s) => s === '.git' || s === 'node_modules')) return true;
  const base = basenameOf(path).toLowerCase();
  if (base === '.env') return true;
  if (base.startsWith('.env.') && !ENV_TEMPLATES.has(base)) return true;
  if (KEY_FILE_EXTENSIONS.some((ext) => base.endsWith(ext))) return true;
  return KEY_FILE_PREFIXES.some((prefix) => base.startsWith(prefix));
}

function contextPriority(base: string): number | null {
  if (/^readme/i.test(base)) return 0;
  if (MANIFESTS.has(base)) return 1;
  if (COMPOSE_FILES.has(base)) return 2;
  if (ENV_TEMPLATES.has(base.toLowerCase())) return 3;
  return null;
}

function kindOf(priority: number): PromptFileKind {
  return priority === 0 ? 'readme' : 'config';
}

/**
 * README, manifests, compose and env-example files at the repo root and one
 * directory down, regular files only (a symlink is never followed), best first.
 */
export function pickContextFiles(entries: readonly GitTreeEntry[]): PromptFileRef[] {
  const picked: { ref: PromptFileRef; priority: number; depth: number }[] = [];
  for (const entry of entries) {
    if (!REGULAR_FILE_MODES.has(entry.mode)) continue;
    const depth = entry.path.split('/').length;
    if (depth > 2) continue;
    if (isSecretPath(entry.path)) continue;
    const priority = contextPriority(basenameOf(entry.path));
    if (priority === null) continue;
    picked.push({
      ref: { path: entry.path, blob: entry.blob, kind: kindOf(priority) },
      priority,
      depth,
    });
  }
  picked.sort(
    (a, b) =>
      a.priority - b.priority || a.depth - b.depth || a.ref.path.localeCompare(b.ref.path),
  );
  return picked.slice(0, CONTEXT_FILES_MAX).map((p) => p.ref);
}

function decodeUtf8(bytes: Buffer): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function clampFile(kind: PromptFileKind, text: string): string {
  if (kind === 'readme') return text.slice(0, README_MAX_CHARS);
  if (kind === 'config') return text.slice(0, CONFIG_FILE_MAX_CHARS);
  return text.split('\n').slice(0, CODE_EXCERPT_MAX_LINES).join('\n').slice(0, CODE_EXCERPT_MAX_CHARS);
}

/**
 * Decodes and clamps the files, skipping undecodable (binary) and secret ones,
 * and stops once `budgetChars` is spent (the input bound).
 */
export function renderPromptFiles({
  files,
  blobs,
  budgetChars = MAX_PROMPT_CHARS,
}: {
  files: readonly PromptFileRef[];
  blobs: ReadonlyMap<string, Buffer | null>;
  budgetChars?: number;
}): PromptFile[] {
  const out: PromptFile[] = [];
  let used = 0;
  for (const file of files) {
    if (used >= budgetChars) break;
    if (isSecretPath(file.path)) continue;
    const bytes = blobs.get(file.blob);
    if (!bytes) continue;
    const decoded = decodeUtf8(bytes);
    if (decoded === null) continue;
    const text = clampFile(file.kind, decoded).slice(0, budgetChars - used);
    if (text === '') continue;
    out.push({ path: file.path, text });
    used += text.length;
  }
  return out;
}

/** Distinct first-two-segment directories of the non-secret entries, sorted, capped. */
export function outlineDirs(entries: readonly GitTreeEntry[]): string[] {
  const dirs = new Set<string>();
  for (const entry of entries) {
    if (isSecretPath(entry.path)) continue;
    const segments = entry.path.split('/');
    if (segments.length < 2) continue;
    dirs.add(segments.length >= 3 ? `${segments[0]}/${segments[1]}` : segments[0]!);
  }
  return [...dirs].sort().slice(0, OUTLINE_DIRS_MAX);
}
