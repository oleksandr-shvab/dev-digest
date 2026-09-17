/**
 * PR-list "latest batch" helpers (`modules/pulls/latest-batch.ts`) — the pure
 * batch-pinning rule shared by the COST and FINDINGS columns, and the
 * per-PR findings aggregation built on top of `rollupSeverities`.
 */
import { describe, it, expect } from 'vitest';
import { pickLatestBatchByPr, aggregateFindingCounts } from '../src/modules/pulls/latest-batch.js';

describe('pickLatestBatchByPr', () => {
  it('groups multi-agent runs sharing the newest multiAgentRunId', () => {
    const runs = [
      { prId: 'pr1', multiAgentRunId: 'batch2', id: 'run3' }, // newest
      { prId: 'pr1', multiAgentRunId: 'batch2', id: 'run2' },
      { prId: 'pr1', multiAgentRunId: 'batch1', id: 'run1' }, // older batch — excluded
    ];
    const result = pickLatestBatchByPr(runs);
    expect(result.get('pr1')).toEqual([runs[0], runs[1]]);
  });

  it('treats a legacy run with no multiAgentRunId as a batch of one', () => {
    const runs = [{ prId: 'pr1', multiAgentRunId: null, id: 'run1' }];
    expect(pickLatestBatchByPr(runs).get('pr1')).toEqual(runs);
  });

  it('skips runs with no prId and keeps PRs independent', () => {
    const runs = [
      { prId: null, multiAgentRunId: null, id: 'orphan' },
      { prId: 'pr1', multiAgentRunId: 'b1', id: 'run1' },
      { prId: 'pr2', multiAgentRunId: 'b2', id: 'run2' },
    ];
    const result = pickLatestBatchByPr(runs);
    expect(result.has(null as unknown as string)).toBe(false);
    expect(result.get('pr1')).toEqual([runs[1]]);
    expect(result.get('pr2')).toEqual([runs[2]]);
  });

  it('returns an empty map for no runs', () => {
    expect(pickLatestBatchByPr([]).size).toBe(0);
  });
});

describe('aggregateFindingCounts', () => {
  it('sums non-dismissed findings across every review in the batch', () => {
    const reviewRows = [{ prId: 'pr1' }, { prId: 'pr1' }];
    const findingRows = [
      { prId: 'pr1', severity: 'CRITICAL' },
      { prId: 'pr1', severity: 'CRITICAL' },
      { prId: 'pr1', severity: 'WARNING' },
    ];
    expect(aggregateFindingCounts(reviewRows, findingRows).get('pr1')).toEqual({
      CRITICAL: 2,
      WARNING: 1,
      SUGGESTION: 0,
    });
  });

  it('reads {0,0,0} for a PR with a review but no surviving (non-dismissed) findings', () => {
    const result = aggregateFindingCounts([{ prId: 'pr1' }], []);
    expect(result.get('pr1')).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
  });

  it('omits a PR entirely when it has no review row (caller reads that as null)', () => {
    const result = aggregateFindingCounts([], []);
    expect(result.has('pr1')).toBe(false);
    expect(result.get('pr1')).toBeUndefined();
  });

  it('keeps PRs independent', () => {
    const reviewRows = [{ prId: 'pr1' }, { prId: 'pr2' }];
    const findingRows = [
      { prId: 'pr1', severity: 'CRITICAL' },
      { prId: 'pr2', severity: 'SUGGESTION' },
    ];
    const result = aggregateFindingCounts(reviewRows, findingRows);
    expect(result.get('pr1')).toEqual({ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 });
    expect(result.get('pr2')).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 1 });
  });
});
