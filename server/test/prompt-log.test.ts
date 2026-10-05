import { describe, it, expect } from 'vitest';
import { emitPromptLog, intentSections, type PromptLogSinks } from '../src/modules/reviews/prompt-log.js';
import { loadConfig, resolvePromptLogDetail } from '../src/platform/config.js';

const ctx = {
  feature: 'review' as const,
  correlationId: 'run-123',
  provider: 'openrouter',
  model: 'deepseek/deepseek-v4-flash',
  label: 'Prompt assembled',
};

const record = {
  scope: 'all files',
  totalChars: 1500,
  totalTokens: 400,
  sections: [
    { name: 'system', source: 'agent.system_prompt', chars: 500, tokens: 120 },
    {
      name: 'diff',
      source: 'git.diff',
      chars: 1000,
      tokens: 280,
      items: [{ label: 'src/a.ts', chars: 600 }, { label: 'src/b.ts', chars: 400 }],
    },
  ],
};

function sinks() {
  const events: { msg: string; data: Record<string, unknown> }[] = [];
  const locals: { msg: string; data: Record<string, unknown> }[] = [];
  const s: PromptLogSinks = {
    event: (msg, data) => events.push({ msg, data }),
    local: (msg, data) => locals.push({ msg, data }),
  };
  return { s, events, locals };
}

describe('emitPromptLog', () => {
  it('summary: one event with sections, model and correlation id; per-item detail is not sent', () => {
    const { s, events, locals } = sinks();
    emitPromptLog(s, 'summary', ctx, record);

    expect(events).toHaveLength(1);
    expect(locals).toHaveLength(0);
    expect(events[0]!.msg).toBe(
      'Prompt assembled (all files): system 500 chars · diff 1000 chars · ~400 tokens (estimate) · openrouter/deepseek/deepseek-v4-flash',
    );
    expect(events[0]!.data).toMatchObject({
      event: 'prompt_assembled',
      feature: 'review',
      correlationId: 'run-123',
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      totalChars: 1500,
      totalTokens: 400,
      sections: [
        { name: 'system', source: 'agent.system_prompt', chars: 500, tokens: 120 },
        { name: 'diff', source: 'git.diff', chars: 1000, tokens: 280 },
      ],
    });
    // file paths from `items` must not leak into the streamed event
    expect(JSON.stringify(events)).not.toContain('src/a.ts');
  });

  it('full: per-item detail goes to the local (stdout-only) sink, never the event sink', () => {
    const { s, events, locals } = sinks();
    emitPromptLog(s, 'full', ctx, record);

    expect(events).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain('src/a.ts');
    expect(locals).toHaveLength(1);
    expect(locals[0]!.data).toMatchObject({
      event: 'prompt_assembled_detail',
      correlationId: 'run-123',
      items: [{ section: 'diff', items: [{ label: 'src/a.ts', chars: 600 }, { label: 'src/b.ts', chars: 400 }] }],
    });
  });

  it('off: nothing is logged', () => {
    const { s, events, locals } = sinks();
    emitPromptLog(s, 'off', ctx, record);
    expect(events).toHaveLength(0);
    expect(locals).toHaveLength(0);
  });

  it('keeps the classifier line prefix and drops the empty scope', () => {
    const { s, events } = sinks();
    emitPromptLog(
      s,
      'summary',
      { ...ctx, feature: 'intent', label: 'Intent prompt' },
      {
        scope: '',
        totalChars: 30,
        totalTokens: 9,
        sections: intentSections([
          { name: 'system', chars: 10 },
          { name: 'issues', chars: 20 },
        ]),
      },
    );
    expect(events[0]!.msg.startsWith('Intent prompt: system 10 chars · issues 20 chars')).toBe(true);
    expect(events[0]!.data.sections).toEqual([
      { name: 'system', source: 'reviewer-core.intent_system_prompt', chars: 10 },
      { name: 'issues', source: 'github.issues', chars: 20 },
    ]);
  });
});

describe('PROMPT_LOG_DETAIL', () => {
  it('defaults to summary', () => {
    expect(resolvePromptLogDetail(undefined, 'development')).toEqual({ detail: 'summary', downgraded: false });
  });

  it('honours full only in development', () => {
    expect(resolvePromptLogDetail('full', 'development')).toEqual({ detail: 'full', downgraded: false });
    expect(resolvePromptLogDetail('full', 'production')).toEqual({ detail: 'summary', downgraded: true });
    expect(resolvePromptLogDetail('full', 'test')).toEqual({ detail: 'summary', downgraded: true });
  });

  it('keeps off and summary in any environment', () => {
    expect(resolvePromptLogDetail('off', 'production')).toEqual({ detail: 'off', downgraded: false });
    expect(resolvePromptLogDetail('summary', 'production')).toEqual({ detail: 'summary', downgraded: false });
  });

  it('loadConfig: reads the env var, treats an empty value as unset, rejects an unknown value', () => {
    const env = (extra: Record<string, string>) => ({ NODE_ENV: 'development', ...extra }) as NodeJS.ProcessEnv;
    expect(loadConfig(env({ PROMPT_LOG_DETAIL: 'full' })).promptLogDetail).toBe('full');
    expect(loadConfig(env({ PROMPT_LOG_DETAIL: '' })).promptLogDetail).toBe('summary');
    const prod = loadConfig({ NODE_ENV: 'production', PROMPT_LOG_DETAIL: 'full' } as NodeJS.ProcessEnv);
    expect(prod.promptLogDetail).toBe('summary');
    expect(prod.promptLogDetailDowngraded).toBe(true);
    expect(() => loadConfig(env({ PROMPT_LOG_DETAIL: 'verbose' }))).toThrow();
  });
});
