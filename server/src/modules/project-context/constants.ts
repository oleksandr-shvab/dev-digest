/** Hard cap on docs returned by one list call (the response carries the true total). */
export const MAX_LISTED_DOCS = 1000;

/** Path segments that are never offered or read, wherever they appear. */
export const EXCLUDED_SEGMENTS = ['.git', 'node_modules'] as const;

/** Git modes of regular files. `120000` (symlink) and `160000` (submodule) are excluded. */
export const REGULAR_FILE_MODES = ['100644', '100755'] as const;

/** Max entries of the blob-sha -> token-count memo. */
export const TOKEN_CACHE_MAX = 5000;
