/**
 * Onboarding tour bounds (plans/onboarding-tour.md). The index chooses the
 * files; these caps keep the stored tour and the prompt small.
 */

export const CRITICAL_PATHS_MAX = 8;
export const READING_PATH_MAX = 6;
export const RUN_STEPS_MAX = 8;
export const FIRST_TASKS_MAX = 5;
export const TASK_PATHS_MAX = 5;
export const ARCH_LINKS_MAX = 8;
/** How many top-ranked files are fetched from the index to fill / order the lists. */
export const RANKED_FETCH = 50;

export const NOTE_MAX_CHARS = 200;
export const SUMMARY_MAX_CHARS = 4_000;
export const DIAGRAM_MAX_CHARS = 4_000;

/** Input bound: total characters of repo files placed in the prompt. */
export const MAX_PROMPT_CHARS = 60_000;

export const GENERATION_TIMEOUT_MS = 120_000;
export const TOUR_SCHEMA_NAME = 'OnboardingTourGeneration';

/**
 * Substrings matched against `'/' + path.toLowerCase()`. A path containing any
 * of them is never offered as a Critical-paths / Reading-path file: tests,
 * configs, migrations and generated or vendored output.
 */
export const EXCLUDED_PATH_PATTERNS: readonly string[] = [
  // tests
  '.test.',
  '.spec.',
  '/__tests__/',
  '/__mocks__/',
  '/test/',
  '/tests/',
  '/__fixtures__/',
  '/e2e/',
  // configs
  '.config.',
  '/vitest.',
  '/jest.',
  'eslint',
  'prettier',
  '/tsconfig',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.lock',
  '/.env',
  // migrations
  '/migrations/',
  // generated / vendored
  '/dist/',
  '/build/',
  '/.next/',
  '/coverage/',
  '/node_modules/',
  '/vendor/',
  'generated',
  '.gen.',
  '.min.',
  '.d.ts',
  '.map',
];

/** Input files (README, manifests, compose, env example) offered to the prompt. */
export const CONTEXT_FILES_MAX = 16;
export const README_MAX_CHARS = 8_000;
export const CONFIG_FILE_MAX_CHARS = 4_000;
export const CODE_EXCERPT_MAX_LINES = 80;
export const CODE_EXCERPT_MAX_CHARS = 3_000;
export const OUTLINE_DIRS_MAX = 60;
