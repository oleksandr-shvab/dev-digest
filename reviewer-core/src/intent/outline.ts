import type { UnifiedDiff } from '@devdigest/shared';

/**
 * A compact outline of the changed files for the intent classifier: path,
 * additions/deletions and the `@@` hunk headers — and nothing else. Diff bodies
 * stay out on purpose: the classifier needs to know WHERE the change is, not
 * what it says (and a diff can carry secrets).
 */

export const MAX_CHANGED_FILES_OUTLINE_CHARS = 20_000;
export const MAX_HUNK_HEADER_CHARS = 200;

interface FileOutline {
  gitPath: string;
  oldPath: string | null;
  newPath: string | null;
  additions: number;
  deletions: number;
  hunkHeaders: string[];
}

const DIFF_GIT = 'diff --git ';

function stripPrefix(value: string, prefix: string): string | null {
  return value.startsWith(prefix) ? value.slice(prefix.length) : null;
}

/** The `b/` path of a `diff --git a/x b/x` line (used for pure renames and binary files). */
function pathFromDiffGitLine(line: string): string {
  const idx = line.lastIndexOf(' b/');
  return idx === -1 ? '' : line.slice(idx + 3);
}

function parseFiles(raw: string): FileOutline[] {
  const files: FileOutline[] = [];
  let current: FileOutline | null = null;
  let inHunk = false;

  for (const line of raw.split('\n')) {
    if (line.startsWith(DIFF_GIT)) {
      current = {
        gitPath: pathFromDiffGitLine(line),
        oldPath: null,
        newPath: null,
        additions: 0,
        deletions: 0,
        hunkHeaders: [],
      };
      files.push(current);
      inHunk = false;
      continue;
    }
    if (!current) continue;

    if (line.startsWith('@@')) {
      inHunk = true;
      current.hunkHeaders.push(line.slice(0, MAX_HUNK_HEADER_CHARS));
      continue;
    }
    if (inHunk) {
      if (line.startsWith('+')) current.additions++;
      else if (line.startsWith('-')) current.deletions++;
      continue;
    }
    // Header lines before the first hunk
    const newSide = stripPrefix(line, '+++ ');
    if (newSide !== null) {
      current.newPath = newSide === '/dev/null' ? '/dev/null' : (stripPrefix(newSide, 'b/') ?? newSide);
      continue;
    }
    const oldSide = stripPrefix(line, '--- ');
    if (oldSide !== null) {
      current.oldPath = oldSide === '/dev/null' ? '/dev/null' : (stripPrefix(oldSide, 'a/') ?? oldSide);
    }
  }
  return files;
}

function renderFile(file: FileOutline): string {
  const deleted = file.newPath === '/dev/null';
  const path = deleted
    ? file.oldPath && file.oldPath !== '/dev/null'
      ? file.oldPath
      : file.gitPath
    : (file.newPath ?? file.gitPath);
  const counts = `+${file.additions} -${file.deletions}${deleted ? ', deleted' : ''}`;
  return [`${path} (${counts})`, ...file.hunkHeaders.map((h) => `  ${h}`)].join('\n');
}

export function changedFilesOutline(diff: UnifiedDiff): {
  text: string;
  files: number;
  omitted: number;
} {
  const parsed = parseFiles(diff.raw);
  const blocks: string[] = [];
  let length = 0;

  for (const file of parsed) {
    const block = renderFile(file);
    const added = block.length + (blocks.length > 0 ? 1 : 0);
    if (length + added > MAX_CHANGED_FILES_OUTLINE_CHARS) break;
    blocks.push(block);
    length += added;
  }

  const omitted = parsed.length - blocks.length;
  const text = omitted > 0 ? [...blocks, `… ${omitted} more file(s) omitted`].join('\n') : blocks.join('\n');
  return { text, files: blocks.length, omitted };
}
