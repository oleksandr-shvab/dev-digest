import { describe, it, expect } from 'vitest';
import { reviewPullRequest, type PromptAssemblyRecord } from '@devdigest/reviewer-core';
import { MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { RunBus } from '../src/platform/sse.js';
import { RunLogger, type PinoLike } from '../src/platform/run-logger.js';
import { emitPromptLog } from '../src/modules/reviews/prompt-log.js';

/**
 * The real path the run executor wires: engine → record → emitPromptLog →
 * RunLogger (bus + stdout). Checks what each sink actually receives.
 */
describe('prompt-assembly logging through RunLogger', () => {
  const review = { verdict: 'comment', summary: 's', score: 90, findings: [] };

  async function run(detail: 'summary' | 'full') {
    const lines: { obj: Record<string, unknown>; msg?: string }[] = [];
    const pino: PinoLike = {
      info: (obj, msg) => lines.push({ obj: obj as Record<string, unknown>, ...(msg ? { msg } : {}) }),
      warn: (obj, msg) => lines.push({ obj: obj as Record<string, unknown>, ...(msg ? { msg } : {}) }),
      error: (obj, msg) => lines.push({ obj: obj as Record<string, unknown>, ...(msg ? { msg } : {}) }),
      debug: (obj, msg) => lines.push({ obj: obj as Record<string, unknown>, ...(msg ? { msg } : {}) }),
    };
    const bus = new RunBus();
    const runLog = new RunLogger(bus, ['run-1'], pino, { correlationId: 'run-1' });
    const diff = await new MockGitClient().diff();

    await reviewPullRequest({
      systemPrompt: 'reviewer',
      model: 'm',
      diff,
      llm: new MockLLMProvider('openai', { structured: review }),
      specs: ['PRIVATE-SPEC-SENTINEL'],
      promptLog: {
        detail: detail === 'full',
        countTokens: (t) => Math.ceil(t.length / 4),
        onAssembled: (r: PromptAssemblyRecord) =>
          emitPromptLog(
            {
              event: (msg, data) => runLog.event('info', msg, data),
              local: (msg, data) => runLog.local(msg, data),
            },
            detail,
            { feature: 'review', correlationId: 'run-1', provider: 'openai', model: 'm', label: 'Prompt assembled' },
            { scope: r.chunk, sections: r.sections, totalChars: r.totalChars, totalTokens: r.totalTokens! },
          ),
      },
    });
    return { lines, bus };
  }

  it('summary: streamed + stdout line carries sections, model and correlation id, and no content', async () => {
    const { lines, bus } = await run('summary');

    const streamed = bus.buffer('run-1').filter((e) => e.msg.startsWith('Prompt assembled'));
    expect(streamed).toHaveLength(1);
    expect(streamed[0]!.data).toMatchObject({ event: 'prompt_assembled', correlationId: 'run-1', model: 'm' });

    const stdout = lines.filter((l) => l.msg?.startsWith('Prompt assembled'));
    expect(stdout).toHaveLength(1);
    expect(stdout[0]!.obj).toMatchObject({ correlationId: 'run-1', runIds: ['run-1'] });

    const everything = JSON.stringify({ lines, events: bus.buffer('run-1') });
    expect(everything).not.toContain('sk_live_xxx'); // the secret in the mock diff
    expect(everything).not.toContain('PRIVATE-SPEC-SENTINEL');
    expect(everything).not.toContain('src/config.ts'); // file paths are detail-only
  });

  it('full: per-file detail reaches stdout only, never the stream', async () => {
    const { lines, bus } = await run('full');

    const detail = lines.find((l) => l.msg?.startsWith('Prompt assembled detail'));
    expect(JSON.stringify(detail)).toContain('src/config.ts');
    expect(JSON.stringify(bus.buffer('run-1'))).not.toContain('src/config.ts');
    expect(JSON.stringify(lines)).not.toContain('sk_live_xxx');
    expect(JSON.stringify(lines)).not.toContain('PRIVATE-SPEC-SENTINEL');
  });
});
