import { describe, it, expect } from 'vitest';
import type { ConventionCandidate } from '@devdigest/shared';
import { buildSkillDraft, buildSkillDraftBody } from '../src/modules/conventions/skill-draft.js';
import { DEFAULT_SKILL_DESCRIPTION, DEFAULT_SKILL_NAME } from '../src/modules/conventions/constants.js';

function candidate(overrides: Partial<ConventionCandidate>): ConventionCandidate {
  return {
    id: 'c1',
    repo_id: 'r1',
    category: 'naming',
    rule: 'Use camelCase.',
    evidence_path: 'src/a.ts',
    evidence_line: 1,
    evidence_snippet: 'const fooBar = 1;',
    confidence: 0.5,
    status: 'accepted',
    edited: false,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildSkillDraftBody', () => {
  it('groups by category in CATEGORY_ORDER and sorts by confidence desc within a category', () => {
    const body = buildSkillDraftBody('acme/widgets', [
      candidate({ id: 'a', category: 'testing', rule: 'Cover the empty case.', confidence: 0.4 }),
      candidate({ id: 'b', category: 'naming', rule: 'Use camelCase.', confidence: 0.6 }),
      candidate({ id: 'c', category: 'naming', rule: 'Prefix booleans with is/has.', confidence: 0.9 }),
    ]);
    const namingIdx = body.indexOf('## Naming');
    const testingIdx = body.indexOf('## Testing');
    expect(namingIdx).toBeGreaterThan(-1);
    expect(testingIdx).toBeGreaterThan(namingIdx); // naming sorts before testing (CATEGORY_ORDER)

    const namingSection = body.slice(namingIdx, testingIdx);
    expect(namingSection.indexOf('Prefix booleans')).toBeLessThan(namingSection.indexOf('Use camelCase'));
  });

  it('cites file:line for each rule and names the repo in the intro', () => {
    const body = buildSkillDraftBody('acme/widgets', [candidate({})]);
    expect(body).toContain('acme/widgets');
    expect(body).toContain('- Use camelCase. — e.g. `src/a.ts:1`');
  });

  it('omits categories with no candidates', () => {
    const body = buildSkillDraftBody('acme/widgets', [candidate({ category: 'other' })]);
    expect(body).not.toContain('## Naming');
    expect(body).toContain('## Other');
  });
});

describe('buildSkillDraft', () => {
  it('uses the default name/description/type and the distinct evidence files', () => {
    const draft = buildSkillDraft('acme/widgets', [
      candidate({ id: 'a', evidence_path: 'src/a.ts' }),
      candidate({ id: 'b', evidence_path: 'src/a.ts' }),
      candidate({ id: 'c', evidence_path: 'src/b.ts' }),
    ]);
    expect(draft.name).toBe(DEFAULT_SKILL_NAME);
    expect(draft.description).toBe(DEFAULT_SKILL_DESCRIPTION);
    expect(draft.type).toBe('convention');
    expect(draft.evidence_files.sort()).toEqual(['src/a.ts', 'src/b.ts']);
  });
});
