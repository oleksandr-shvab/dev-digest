import { MAX_SKILL_BODY_CHARS } from '@devdigest/shared';

/** Constants for the skills module. */

export { MAX_SKILL_BODY_CHARS };

/** Version recorded when a skill is created. */
export const INITIAL_SKILL_VERSION = 1;

/** Default version messages (Decision 7). */
export const MESSAGE_INITIAL = 'Initial version';
export const MESSAGE_EDITED = 'Edited';
export const MESSAGE_IMPORTED_PREFIX = 'Imported from';

/** Skill stats window (days) on `agent_runs.ran_at`. */
export const STATS_WINDOW_DAYS = 30;

// ---- Import limits (defensive; nothing is ever written to disk) -------------

/** Max size of the uploaded file. */
export const MAX_UPLOAD_BYTES = 1024 * 1024;
/** Max number of entries in an uploaded zip. */
export const MAX_ZIP_ENTRIES = 200;
/** Max total uncompressed size declared by the zip central directory (zip-bomb guard). */
export const MAX_ZIP_UNCOMPRESSED_BYTES = 5 * 1024 * 1024;
/**
 * Multipart framing slack on top of `MAX_UPLOAD_BYTES` for the route's
 * `bodyLimit` (boundaries + part headers).
 */
export const MULTIPART_OVERHEAD_BYTES = 16 * 1024;

/** The one file read from a skill zip. */
export const SKILL_FILE_NAME = 'SKILL.md';

/** Extensions reported as `script` when ignored from a zip. */
export const SCRIPT_EXTENSIONS = new Set([
  'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd', 'py', 'rb', 'pl', 'php',
  'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'lua', 'go', 'rs', 'java', 'exe',
]);
/** Extensions reported as `non-skill-file` (plain text / docs the skill may reference). */
export const TEXT_EXTENSIONS = new Set([
  'md', 'markdown', 'txt', 'json', 'yaml', 'yml', 'toml', 'csv', 'xml', 'html', 'css',
]);

/** Default skill type for an imported draft. */
export const DEFAULT_IMPORT_TYPE = 'custom' as const;
