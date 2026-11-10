import { describe, expect, it } from 'vitest';
import { ZodError, z } from 'zod';
import { BriefBudgetError } from '../src/modules/brief/budget.js';
import { failureReason, toBriefState } from '../src/modules/brief/helpers.js';
import { BriefGenerationRegistry } from '../src/modules/brief/registry.js';
import type { BriefRow } from '../src/modules/brief/repository.js';
import { ConfigError } from '../src/platform/errors.js';
import { TimeoutError } from '../src/platform/resilience.js';

describe('BriefGenerationRegistry', () => {
  it('refuses a second start until succeed or fail', () => {
    const reg = new BriefGenerationRegistry();
    expect(reg.tryStart('p1')).toBe(true);
    expect(reg.tryStart('p1')).toBe(false);
    expect(reg.tryStart('p2')).toBe(true);
    reg.succeed('p1');
    expect(reg.tryStart('p1')).toBe(true);
    reg.fail('p1', 'boom');
    expect(reg.tryStart('p1')).toBe(true);
  });

  it('keeps the failure reason in the snapshot until the next start', () => {
    const reg = new BriefGenerationRegistry();
    reg.tryStart('p');
    reg.fail('p', 'timed out');
    expect(reg.snapshot('p')).toEqual({ generating: false, lastError: 'timed out' });
    reg.tryStart('p');
    expect(reg.snapshot('p')).toEqual({ generating: true, lastError: null });
    expect(reg.snapshot('unknown')).toEqual({ generating: false, lastError: null });
  });
});

describe('failureReason', () => {
  it('maps each branch to a one-line reason', () => {
    expect(failureReason(new TimeoutError(10))).toBe('timed out');
    expect(failureReason(new ConfigError('OPENAI_API_KEY is not configured'))).toBe(
      'OPENAI_API_KEY is not configured',
    );
    expect(failureReason(new BriefBudgetError())).toBe('input exceeds the 8,000-token budget');
    const zodErr = (() => {
      try {
        z.string().parse(1);
      } catch (e) {
        return e as ZodError;
      }
      throw new Error('unreachable');
    })();
    expect(failureReason(zodErr)).toBe('output failed validation');
    expect(failureReason(new Error('LLM schema validation failed'))).toBe('output failed validation');
    expect(failureReason(new Error('x'.repeat(500)))).toHaveLength(200);
    expect(failureReason(new Error('503 upstream'))).toBe('provider error: 503 upstream');
  });
});

const brief = {
  summary: 's',
  risks: [],
  review_focus: [{ file: 'src/a.ts', line: null, reason: 'r' }],
};

function row(over: Partial<BriefRow> = {}): BriefRow {
  return {
    prId: 'pr1',
    json: brief,
    headSha: 'aaa',
    generatedAt: new Date('2026-11-10T10:00:00.000Z'),
    provider: 'openai',
    model: 'gpt-4.1',
    tokensIn: 100,
    tokensOut: 50,
    costUsd: 0.001,
    unavailableInputs: null,
    omittedInputs: null,
    ...over,
  };
}

const idle = { generating: false, lastError: null };

describe('toBriefState', () => {
  it('is stale for a different head and fresh for the same head (AC-19)', () => {
    expect(toBriefState({ prId: 'pr1', row: row(), headSha: 'bbb', snapshot: idle }).stale).toBe(true);
    const fresh = toBriefState({ prId: 'pr1', row: row(), headSha: 'aaa', snapshot: idle });
    expect(fresh.stale).toBe(false);
    expect(fresh.brief).toEqual(brief);
    expect(fresh.generated_at).toBe('2026-11-10T10:00:00.000Z');
    expect(fresh.unavailable_inputs).toEqual([]);
    expect(fresh.omitted_inputs).toEqual([]);
  });

  it('reads a row with a null head_sha, a missing row or bad JSON as no brief', () => {
    for (const r of [row({ headSha: null }), undefined, row({ json: { nope: true } })]) {
      const state = toBriefState({ prId: 'pr1', row: r, headSha: 'aaa', snapshot: idle });
      expect(state.brief).toBeNull();
      expect(state).toMatchObject({
        head_sha: null,
        generated_at: null,
        stale: false,
        provider: null,
        tokens_in: null,
        cost_usd: null,
        unavailable_inputs: [],
        omitted_inputs: [],
      });
    }
  });

  it('keeps cost_usd null when the cost is unknown (AC-24) and passes the live status', () => {
    const state = toBriefState({
      prId: 'pr1',
      row: row({ costUsd: null }),
      headSha: 'aaa',
      snapshot: { generating: true, lastError: 'timed out' },
    });
    expect(state.cost_usd).toBeNull();
    expect(state.tokens_in).toBe(100);
    expect(state.generating).toBe(true);
    expect(state.last_error).toBe('timed out');
  });
});
