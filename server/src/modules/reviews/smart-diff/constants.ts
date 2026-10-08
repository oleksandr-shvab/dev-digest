import type { SmartDiffRole } from '@devdigest/shared';

/** Display order of the Smart Diff groups. */
export const SMART_DIFF_ROLE_ORDER: readonly SmartDiffRole[] = [
  'core',
  'tests',
  'wiring',
  'docs',
  'boilerplate',
];

/** Role of a path that matches no rule. */
export const FALLBACK_ROLE: SmartDiffRole = 'core';

/**
 * Path rules, matched against the repo-relative, forward-slash path.
 * The order is load-bearing: the first matching rule wins, checked as
 * boilerplate → tests → wiring → docs. The three disputed cases are pinned in
 * `server/test/reviews-smart-diff.test.ts`:
 *   - `src/__tests__/__snapshots__/x.snap` is boilerplate (not tests),
 *   - `.claude/skills/security/SKILL.md` is wiring (not docs),
 *   - `e2e/README.md` is tests (not docs).
 */
export const ROLE_RULES: readonly {
  role: Exclude<SmartDiffRole, 'core'>;
  patterns: readonly RegExp[];
}[] = [
  {
    role: 'boilerplate',
    patterns: [
      /\.lock$/, // *.lock
      /(^|\/)pnpm-lock\.yaml$/,
      /(^|\/)package-lock\.json$/,
      /(^|\/)yarn\.lock$/,
      /^dist\//, // dist/**
      /^build\//, // build/**
      /(^|\/)__snapshots__\//,
      /\.snap$/,
      /(^|\/)[^/]*\.generated\.[^/]+$/, // *.generated.*
      /\.min\.js$/,
    ],
  },
  {
    role: 'tests',
    patterns: [
      /\.test\.tsx?$/, // *.test.ts(x); also covers *.it.test.ts
      /\.spec\.ts$/,
      /(^|\/)tests?\//, // **/test/**, **/tests/**
      /(^|\/)__tests__\//,
      /^e2e\//,
    ],
  },
  {
    role: 'wiring',
    patterns: [
      /(^|\/)index\.(ts|js)$/, // barrels
      /(^|\/)[^/]*\.config\.[^/]+$/, // *.config.*
      /(^|\/)tsconfig[^/]*\.json$/,
      /(^|\/)\.eslintrc[^/]*$/,
      /(^|\/)\.env[^/]*$/,
      /(^|\/)docker-compose[^/]*\.yml$/,
      /^\.github\//,
      /^\.claude\//,
    ],
  },
  {
    role: 'docs',
    patterns: [
      /\.md$/,
      /^docs\//,
      /(^|\/)README[^/]*$/,
      /(^|\/)CHANGELOG[^/]*$/,
      /(^|\/)LICENSE$/,
    ],
  },
];
