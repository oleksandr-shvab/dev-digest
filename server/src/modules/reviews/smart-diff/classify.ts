import type { SmartDiffRole } from '@devdigest/shared';
import { FALLBACK_ROLE, ROLE_RULES } from './constants.js';

/** Role of a PR file by its repo-relative path. Pure: no I/O, no model call. */
export function classifyFile(path: string): SmartDiffRole {
  for (const rule of ROLE_RULES) {
    if (rule.patterns.some((p) => p.test(path))) return rule.role;
  }
  return FALLBACK_ROLE;
}
