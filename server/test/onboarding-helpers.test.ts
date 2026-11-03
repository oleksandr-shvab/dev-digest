import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import { failureReason, readinessOf, toTourDto } from '../src/modules/onboarding/helpers.js';
import { TourGenerationRegistry } from '../src/modules/onboarding/registry.js';
import type { OnboardingRow } from '../src/modules/onboarding/repository.js';
import type { IndexState } from '../src/modules/repo-intel/types.js';
import { ConfigError } from '../src/platform/errors.js';
import { TimeoutError } from '../src/platform/resilience.js';

describe('failureReason', () => {
  it('maps a timeout', () => {
    expect(failureReason(new TimeoutError(1))).toBe('timed out');
  });

  it('keeps a config error message', () => {
    expect(failureReason(new ConfigError('OPENROUTER_API_KEY is not configured'))).toBe(
      'OPENROUTER_API_KEY is not configured',
    );
  });

  it('maps schema failures to "output failed validation"', () => {
    expect(failureReason(new Error('Response failed schema validation after 1 attempt'))).toBe(
      'output failed validation',
    );
    expect(failureReason(new ZodError([]))).toBe('output failed validation');
  });

  it('prefixes any other error and clamps it to 200 chars', () => {
    expect(failureReason(new Error('boom'))).toBe('provider error: boom');
    expect(failureReason(new Error('x'.repeat(500)))).toHaveLength(200);
    expect(failureReason('plain string')).toBe('provider error: plain string');
  });
});

const state = (over: Partial<IndexState> = {}): IndexState => ({
  repoId: 'r1',
  status: 'full',
  filesIndexed: 120,
  filesSkipped: 0,
  durationMs: 1,
  lastIndexedSha: 'a'.repeat(40),
  indexerVersion: 2,
  updatedAt: new Date(0),
  ...over,
});

describe('readinessOf', () => {
  it('is ready for a full index', () => {
    expect(readinessOf({ mirrorOk: true, state: state() })).toEqual({
      ready: true,
      reason: null,
      status: 'full',
      indexed_sha: 'a'.repeat(40),
      file_count: 120,
    });
  });

  it('is ready for a partial index and reports its status', () => {
    const r = readinessOf({ mirrorOk: true, state: state({ status: 'partial' }) });
    expect(r.ready).toBe(true);
    expect(r.status).toBe('partial');
  });

  it('reports no_mirror first', () => {
    const r = readinessOf({ mirrorOk: false, state: state({ status: 'failed' }) });
    expect(r.reason).toBe('no_mirror');
    expect(r.ready).toBe(false);
  });

  it('reports index_failed', () => {
    const r = readinessOf({ mirrorOk: true, state: state({ status: 'failed' }) });
    expect(r).toMatchObject({ ready: false, reason: 'index_failed', status: 'failed' });
  });

  it.each([
    ['degradedReason no_data', { degradedReason: 'no_data' as const }],
    ['empty sha', { lastIndexedSha: '' }],
    ['zero files', { filesIndexed: 0 }],
  ])('reports no_data for %s, with null status and sha', (_name, over) => {
    const r = readinessOf({ mirrorOk: true, state: state(over) });
    expect(r).toMatchObject({ ready: false, reason: 'no_data', status: null, indexed_sha: null });
  });
});

describe('TourGenerationRegistry', () => {
  it('refuses a second tryStart while generating', () => {
    const reg = new TourGenerationRegistry();
    expect(reg.tryStart('r1')).toBe(true);
    expect(reg.tryStart('r1')).toBe(false);
    expect(reg.tryStart('r2')).toBe(true);
    expect(reg.snapshot('r1')).toEqual({ generating: true, lastError: null });
  });

  it('clears lastError on a new start and records a failure', () => {
    const reg = new TourGenerationRegistry();
    reg.tryStart('r1');
    reg.fail('r1', 'timed out');
    expect(reg.snapshot('r1')).toEqual({ generating: false, lastError: 'timed out' });
    expect(reg.tryStart('r1')).toBe(true);
    expect(reg.snapshot('r1').lastError).toBeNull();
    reg.succeed('r1');
    expect(reg.snapshot('r1')).toEqual({ generating: false, lastError: null });
  });

  it('cancel stops generating and keeps lastError cleared', () => {
    const reg = new TourGenerationRegistry();
    reg.tryStart('r1');
    reg.cancel('r1');
    expect(reg.snapshot('r1')).toEqual({ generating: false, lastError: null });
    expect(reg.tryStart('r1')).toBe(true);
  });

  it('starts every repo idle', () => {
    expect(new TourGenerationRegistry().snapshot('nope')).toEqual({
      generating: false,
      lastError: null,
    });
  });
});

describe('toTourDto', () => {
  const content = {
    architecture: { summary_md: 'S', diagram: null, links: [] },
    critical_paths: { source: 'critical_paths', items: [{ path: 'src/a.ts', note: null }] },
    run_steps: [{ command: 'pnpm dev' }],
    reading_path: [],
    first_tasks: [],
  };
  const row: OnboardingRow = {
    repoId: 'r1',
    json: content,
    generatedAt: new Date('2026-01-01T00:00:00.000Z'),
    commitSha: 'c'.repeat(40),
    indexFileCount: 7,
    indexStatus: 'partial',
  };

  it('maps a full row', () => {
    expect(toTourDto(row)).toMatchObject({
      repo_id: 'r1',
      generated_at: '2026-01-01T00:00:00.000Z',
      commit_sha: 'c'.repeat(40),
      index_file_count: 7,
      index_status: 'partial',
      run_steps: [{ command: 'pnpm dev' }],
    });
  });

  it('returns null for a legacy row without commitSha, a missing row and invalid JSON', () => {
    expect(toTourDto({ ...row, commitSha: null })).toBeNull();
    expect(toTourDto(undefined)).toBeNull();
    expect(toTourDto({ ...row, json: { nope: true } })).toBeNull();
  });
});
