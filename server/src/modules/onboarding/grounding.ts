import type { OnboardingTourContent } from '@devdigest/shared';
import {
  ARCH_LINKS_MAX,
  DIAGRAM_MAX_CHARS,
  FIRST_TASKS_MAX,
  NOTE_MAX_CHARS,
  RUN_STEPS_MAX,
  SUMMARY_MAX_CHARS,
  TASK_PATHS_MAX,
} from './constants.js';
import type { TourGeneration } from './prompt.js';

/**
 * Output-validation boundary for LLM data. The index chose the files; the model
 * only wrote words about them. Anything that names a path the commit does not
 * contain is dropped here (AC-9, AC-10, AC-17, AC-18).
 */

export function normalizeRepoPath(p: string): string {
  return p.trim().replace(/^(?:\.\/|\/)+/, '');
}

/** Collapses whitespace to single spaces and clamps to `max` characters. */
export function toOneLine(s: string, max: number): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

function oneLineOrNull(s: string): string | null {
  const line = toOneLine(s, NOTE_MAX_CHARS);
  return line === '' ? null : line;
}

/** Notes keyed by normalized path; the first entry for a path wins. */
function indexByPath<T extends { path: string }>(entries: readonly T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const entry of entries) {
    const key = normalizeRepoPath(entry.path);
    if (!map.has(key)) map.set(key, entry);
  }
  return map;
}

function cleanDiagram(diagram: string | null): string | null {
  if (diagram === null) return null;
  const stripped = diagram
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('```'))
    .join('\n')
    .trim();
  // A truncated diagram would not parse, so an overlong one is dropped, not cut.
  if (stripped === '' || stripped.length > DIAGRAM_MAX_CHARS) return null;
  return stripped;
}

export interface GroundTourInput {
  generation: TourGeneration;
  critical: { source: 'critical_paths' | 'file_rank'; paths: readonly string[] };
  reading: readonly string[];
  /** Regular-file paths of the commit the index was built from. */
  exists: ReadonlySet<string>;
}

export function groundTour({
  generation,
  critical,
  reading,
  exists,
}: GroundTourInput): OnboardingTourContent {
  const notes = indexByPath(generation.critical_notes);
  const reasons = indexByPath(generation.reading_reasons);

  const links: OnboardingTourContent['architecture']['links'] = [];
  for (const link of generation.architecture.links) {
    const path = normalizeRepoPath(link.path);
    const label = toOneLine(link.label, NOTE_MAX_CHARS);
    if (label === '' || !exists.has(path)) continue;
    links.push({ label, path });
    if (links.length === ARCH_LINKS_MAX) break;
  }

  const firstTasks: OnboardingTourContent['first_tasks'] = [];
  for (const task of generation.first_tasks) {
    const paths = [...new Set(task.paths.map(normalizeRepoPath))];
    const title = toOneLine(task.title, NOTE_MAX_CHARS);
    if (title === '' || paths.length === 0 || !paths.every((p) => exists.has(p))) continue;
    firstTasks.push({
      title,
      description: toOneLine(task.description, NOTE_MAX_CHARS),
      paths: paths.slice(0, TASK_PATHS_MAX),
    });
    if (firstTasks.length === FIRST_TASKS_MAX) break;
  }

  const runSteps: OnboardingTourContent['run_steps'] = [];
  for (const step of generation.run_steps) {
    const command = step.command.trim();
    if (command === '' || /[\r\n]/.test(command)) continue;
    runSteps.push({ command });
    if (runSteps.length === RUN_STEPS_MAX) break;
  }

  return {
    architecture: {
      summary_md: generation.architecture.summary_md.trim().slice(0, SUMMARY_MAX_CHARS),
      diagram: cleanDiagram(generation.architecture.diagram),
      links,
    },
    critical_paths: {
      source: critical.source,
      items: critical.paths.map((path) => {
        const note = notes.get(path)?.note;
        return { path, note: note === undefined ? null : oneLineOrNull(note) };
      }),
    },
    run_steps: runSteps,
    reading_path: reading.map((path) => {
      const reason = reasons.get(path)?.reason;
      return { path, reason: reason === undefined ? null : oneLineOrNull(reason) };
    }),
    first_tasks: firstTasks,
  };
}
