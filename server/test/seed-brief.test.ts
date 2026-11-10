import { describe, expect, it } from 'vitest';
import { PrBrief } from '@devdigest/shared';
import { firstChangedLine } from '../src/modules/brief/facts.js';
import { SEED_PR_BRIEF, SEED_PR_FILE_PATCHES } from '../src/db/seed-brief.js';

describe('seeded PR brief', () => {
  it('is a valid PrBrief', () => {
    expect(PrBrief.safeParse(SEED_PR_BRIEF).success).toBe(true);
  });

  it('only names files that have a seeded patch', () => {
    const patched = new Set(Object.keys(SEED_PR_FILE_PATCHES));
    for (const item of SEED_PR_BRIEF.review_focus) expect(patched.has(item.file)).toBe(true);
    for (const risk of SEED_PR_BRIEF.risks) {
      for (const file of risk.file_refs) expect(patched.has(file)).toBe(true);
    }
  });

  it('seeds the first changed lines the brief cites', () => {
    expect(firstChangedLine(SEED_PR_FILE_PATCHES['src/middleware/ratelimit.ts'])).toBe(1);
    expect(firstChangedLine(SEED_PR_FILE_PATCHES['src/api/public/webhooks.ts'])).toBe(22);
  });

  it('puts the flagged config line at line 12', () => {
    expect(firstChangedLine(SEED_PR_FILE_PATCHES['src/config.ts'])).toBe(12);
    const focus = SEED_PR_BRIEF.review_focus.find((i) => i.file === 'src/config.ts');
    expect(focus?.line).toBe(12);
  });
});
