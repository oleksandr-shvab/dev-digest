/** Constants for the conventions module (server/specs/conventions.md). */

import type { ConventionCategory } from '@devdigest/shared';

/** Category order used to group the skill-draft body (Decisions 4, skill-draft body). */
export const CATEGORY_ORDER: ConventionCategory[] = [
  'naming',
  'structure',
  'imports',
  'typing',
  'error-handling',
  'testing',
  'formatting',
  'other',
];

/** Human label for each category heading in the skill-draft body. */
export const CATEGORY_LABEL: Record<ConventionCategory, string> = {
  naming: 'Naming',
  structure: 'Structure',
  imports: 'Imports',
  typing: 'Typing',
  'error-handling': 'Error handling',
  testing: 'Testing',
  formatting: 'Formatting',
  other: 'Other',
};

// ---- Sampling (Decision 2: code only, no model) ------------------------------

/** `repoIntel.getConventionSamples(repoId, n)` sample size. */
export const CODE_SAMPLE_FILES = 12;
/** Config files are looked for at the repo root and one level of subdirectories. */
export const CONFIG_SCAN_MAX_DEPTH = 2;
/** Directories never descended into while looking for config files. */
export const CONFIG_SCAN_SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'vendor', '.next', 'coverage',
]);
/** Filename patterns treated as a lint/format/type config. */
export const CONFIG_FILE_PATTERNS: RegExp[] = [
  /^eslint\.config\.(js|mjs|cjs|ts)$/,
  /^\.eslintrc(\.(js|cjs|json|yaml|yml))?$/,
  /^tsconfig.*\.json$/,
  /^\.prettierrc(\.(js|cjs|json|yaml|yml))?$/,
  /^prettier\.config\.(js|cjs|mjs)$/,
  /^\.editorconfig$/,
];

/** Per-sample caps so one huge file can't blow the prompt budget. */
export const MAX_SAMPLE_LINES = 300;
export const MAX_SAMPLE_CHARS = 12_000;

// ---- Model call ---------------------------------------------------------------

export const CONVENTION_EXTRACTION_SCHEMA_NAME = 'ConventionExtraction';
export const MAX_CANDIDATES = 25;
export const EXTRACT_TIMEOUT_MS = 120_000;

// ---- Evidence check (Decision 5) ----------------------------------------------

/** A cited line may be off by this many lines; the actual match sets `evidence_line`. */
export const EVIDENCE_LINE_WINDOW = 3;

// ---- Skill creation (Decision 11) ----------------------------------------------

export const DEFAULT_SKILL_NAME = 'repo-conventions';
export const DEFAULT_SKILL_DESCRIPTION =
  "Flag code that breaks this repo's extracted conventions (naming, structure, errors…).";
