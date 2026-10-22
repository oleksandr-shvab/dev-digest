import { describe, it, expect } from 'vitest';
import { selectDetailFetchCandidates } from '../src/modules/pulls/pr-files.js';

const row = (over: Partial<{ id: string; number: number; additions: number; deletions: number; filesCount: number }>) => ({
  id: 'p1',
  number: 1,
  additions: 10,
  deletions: 2,
  filesCount: 3,
  ...over,
});
const none = { prIdsWithFiles: new Set<string>(), headChangedNumbers: new Set<number>() };

describe('selectDetailFetchCandidates', () => {
  it('skips a PR that has stats, stored files and an unchanged head', () => {
    const rows = [row({})];
    expect(selectDetailFetchCandidates(rows, { ...none, prIdsWithFiles: new Set(['p1']) }, 10)).toEqual([]);
  });

  it('picks zero-stat PRs, PRs with files_count > 0 but no stored files, and moved heads', () => {
    const rows = [
      row({ id: 'zero', number: 1, additions: 0, deletions: 0, filesCount: 0 }),
      row({ id: 'nofiles', number: 2 }),
      row({ id: 'moved', number: 3 }),
      row({ id: 'ok', number: 4 }),
    ];
    const picked = selectDetailFetchCandidates(
      rows,
      { prIdsWithFiles: new Set(['moved', 'ok']), headChangedNumbers: new Set([3]) },
      10,
    );
    expect(picked.map((r) => r.id)).toEqual(['zero', 'nofiles', 'moved']);
  });

  it('does not pick a PR with files_count 0 and stats just because it has no stored files', () => {
    const rows = [row({ additions: 5, deletions: 0, filesCount: 0 })];
    expect(selectDetailFetchCandidates(rows, none, 10)).toEqual([]);
  });

  it('caps the result at the limit', () => {
    const rows = Array.from({ length: 5 }, (_, i) => row({ id: `p${i}`, number: i, additions: 0, deletions: 0, filesCount: 0 }));
    expect(selectDetailFetchCandidates(rows, none, 2)).toHaveLength(2);
  });
});
