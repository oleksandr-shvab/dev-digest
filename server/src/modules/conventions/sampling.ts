import {
  CONFIG_FILE_PATTERNS,
  CONFIG_SCAN_SKIP_DIRS,
  MAX_SAMPLE_CHARS,
  MAX_SAMPLE_LINES,
} from './constants.js';

/**
 * Sampling — plain code, no model call (server/specs/conventions.md Decision 2).
 * Configs at the repo root + one level of subdirectories, plus the caller-supplied
 * top-ranked code files (`repoIntel.getConventionSamples`). Pure over a small
 * filesystem interface so it's testable without a real clone.
 */

export interface DirEntry {
  name: string;
  isDirectory: boolean;
}

export interface RepoFileSystem {
  listDir(dir: string): Promise<DirEntry[]>;
  readFile(path: string): Promise<string | null>;
}

function isConfigFileName(name: string): boolean {
  return CONFIG_FILE_PATTERNS.some((re) => re.test(name));
}

/** Config files at the repo root and inside its immediate subdirectories. */
export async function findConfigPaths(fs: RepoFileSystem): Promise<string[]> {
  const found: string[] = [];
  const rootEntries = await fs.listDir('').catch(() => []);
  for (const entry of rootEntries) {
    if (!entry.isDirectory && isConfigFileName(entry.name)) found.push(entry.name);
  }
  for (const entry of rootEntries) {
    if (!entry.isDirectory) continue;
    if (CONFIG_SCAN_SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
    const children = await fs.listDir(entry.name).catch(() => []);
    for (const child of children) {
      if (!child.isDirectory && isConfigFileName(child.name)) {
        found.push(`${entry.name}/${child.name}`);
      }
    }
  }
  return found;
}

export interface FileSample {
  path: string;
  /** Line-numbered, capped text — what actually goes in the prompt. */
  rendered: string;
}

/** `  42 | code`, capped at MAX_SAMPLE_LINES lines / MAX_SAMPLE_CHARS chars. */
export function renderSample(path: string, content: string): string {
  const lines = content.split('\n').slice(0, MAX_SAMPLE_LINES);
  const numbered = lines
    .map((line, i) => `${String(i + 1).padStart(4)} | ${line}`)
    .join('\n')
    .slice(0, MAX_SAMPLE_CHARS);
  return `### ${path}\n${numbered}`;
}

/** Read and render every sampled path (configs ∪ code files), skipping unreadable ones. */
export async function buildSamples(
  fs: RepoFileSystem,
  configPaths: string[],
  codePaths: string[],
): Promise<FileSample[]> {
  const seen = new Set<string>();
  const paths = [...configPaths, ...codePaths].filter((p) => {
    if (seen.has(p)) return false;
    seen.add(p);
    return true;
  });
  const samples: FileSample[] = [];
  for (const path of paths) {
    const content = await fs.readFile(path);
    if (content == null) continue;
    samples.push({ path, rendered: renderSample(path, content) });
  }
  return samples;
}
