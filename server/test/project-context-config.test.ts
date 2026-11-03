import { describe, it, expect } from 'vitest';
import {
  loadConfig,
  DEFAULT_PROJECT_CONTEXT_GLOB,
  DEFAULT_PROJECT_CONTEXT_BUDGET_TOKENS,
} from '../src/platform/config.js';

const load = (env: Record<string, string>) => loadConfig({ NODE_ENV: 'test', ...env });

describe('project context config', () => {
  it('uses defaults when unset', () => {
    const c = load({});
    expect(c.projectContextGlobs).toEqual([DEFAULT_PROJECT_CONTEXT_GLOB]);
    expect(c.projectContextGlobs).toEqual(['**/{specs,docs,insights}/**/*.md']);
    expect(c.projectContextBudgetTokens).toBe(DEFAULT_PROJECT_CONTEXT_BUDGET_TOKENS);
    expect(c.projectContextBudgetTokens).toBe(20000);
  });

  it('splits globs on ; and trims, dropping empties', () => {
    expect(load({ PROJECT_CONTEXT_GLOBS: ' a/**/*.md ; b/*.md;; ' }).projectContextGlobs).toEqual([
      'a/**/*.md',
      'b/*.md',
    ]);
  });

  it('treats empty globs as the default', () => {
    expect(load({ PROJECT_CONTEXT_GLOBS: '' }).projectContextGlobs).toEqual([
      DEFAULT_PROJECT_CONTEXT_GLOB,
    ]);
  });

  it('treats an empty budget as 20000 and reads a set one', () => {
    expect(load({ PROJECT_CONTEXT_BUDGET_TOKENS: '' }).projectContextBudgetTokens).toBe(20000);
    expect(load({ PROJECT_CONTEXT_BUDGET_TOKENS: '400' }).projectContextBudgetTokens).toBe(400);
  });

  it('rejects 0 and non-numeric budgets', () => {
    expect(() => load({ PROJECT_CONTEXT_BUDGET_TOKENS: '0' })).toThrow();
    expect(() => load({ PROJECT_CONTEXT_BUDGET_TOKENS: 'abc' })).toThrow();
  });
});
