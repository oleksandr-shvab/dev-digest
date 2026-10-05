import { describe, it, expect } from 'vitest';
import {
  findDuplicateReason,
  normalizeRule,
  planConventionPatch,
  toConventionDto,
} from '../src/modules/conventions/helpers.js';
import type { ConventionRow } from '../src/modules/conventions/repository.js';

const row: ConventionRow = {
  id: 'c1',
  workspaceId: 'ws1',
  repoId: 'repo1',
  category: 'naming',
  rule: 'Use camelCase for variables.',
  evidencePath: 'src/a.ts',
  evidenceLine: 12,
  evidenceSnippet: 'const fooBar = 1;',
  confidence: 0.8,
  status: 'pending',
  edited: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('normalizeRule', () => {
  it('lowercases, collapses whitespace and drops trailing punctuation', () => {
    expect(normalizeRule('Use   camelCase for variables.')).toBe('use camelcase for variables');
    expect(normalizeRule('  Loud rule!! ')).toBe('loud rule');
  });
});

describe('findDuplicateReason', () => {
  const kept = [
    { rule: 'Use camelCase for variables.', status: 'accepted' as const },
    { rule: 'Never swallow an error.', status: 'rejected' as const },
  ];

  it('matches an accepted row as a plain duplicate', () => {
    expect(findDuplicateReason('use camelcase for variables', kept)).toBe('duplicate');
  });

  it('matches a rejected row as rejected_before', () => {
    expect(findDuplicateReason('Never swallow an error', kept)).toBe('rejected_before');
  });

  it('returns undefined for a genuinely new rule', () => {
    expect(findDuplicateReason('Prefer named exports.', kept)).toBeUndefined();
  });
});

describe('planConventionPatch', () => {
  it('changing status alone does not set edited', () => {
    const plan = planConventionPatch(row, { status: 'accepted' });
    expect(plan).toEqual({ set: { status: 'accepted' }, changed: true });
  });

  it('changing the rule sets edited (once)', () => {
    const plan = planConventionPatch(row, { rule: 'Use PascalCase for classes.' });
    expect(plan.set).toEqual({ rule: 'Use PascalCase for classes.', edited: true });
  });

  it('changing category alone also sets edited', () => {
    const plan = planConventionPatch(row, { category: 'structure' });
    expect(plan.set).toEqual({ category: 'structure', edited: true });
  });

  it('never re-sets edited once it is already true', () => {
    const plan = planConventionPatch({ ...row, edited: true }, { rule: 'Something else.' });
    expect(plan.set).toEqual({ rule: 'Something else.' });
  });

  it('identical values are a no-op', () => {
    expect(planConventionPatch(row, { rule: row.rule, status: row.status })).toEqual({
      set: {},
      changed: false,
    });
  });
});

describe('toConventionDto', () => {
  it('maps a row to the public DTO shape', () => {
    expect(toConventionDto(row)).toEqual({
      id: 'c1',
      repo_id: 'repo1',
      category: 'naming',
      rule: 'Use camelCase for variables.',
      evidence_path: 'src/a.ts',
      evidence_line: 12,
      evidence_snippet: 'const fooBar = 1;',
      confidence: 0.8,
      status: 'pending',
      edited: false,
      created_at: '2026-01-01T00:00:00.000Z',
    });
  });
});
