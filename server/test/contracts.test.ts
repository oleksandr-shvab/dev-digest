import { describe, it, expect } from 'vitest';
import {
  Review,
  Finding,
  Intent,
  BlastRadius,
  BlastDegradedReason,
  Risks,
  PrHistory,
  SmartDiff,
  SmartDiffRole,
  Conformance,
  OnboardingTourContent,
  OnboardingTourState,
  EvalRun,
  MemoryItem,
  RunTrace,
  Settings,
  Repo,
  PrDetail,
  Agent,
  Skill,
  AttachmentPath,
  SetContextPathsInput,
  ProjectContextList,
  MAX_ATTACHED_DOCS,
} from '@devdigest/shared';
import { SEED_ONBOARDING_TOUR } from '../src/db/seed-onboarding.js';

/**
 * Contract tests — parse/round-trip the fixtures from data.jsx/data2.jsx
 * so feature agents can rely on the schemas matching the prototype data.
 */
describe('AI contracts parse fixtures', () => {
  it('Review + Finding (data.jsx VERDICT/FINDINGS)', () => {
    const review = Review.parse({
      verdict: 'request_changes',
      summary: 'Two blockers before merge.',
      score: 61,
      findings: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key in commit',
          file: 'src/config.ts',
          start_line: 12,
          end_line: 12,
          rationale: 'Line 12 contains a literal `sk_live_` Stripe key.',
          suggestion: 'Move to env and rotate.',
          confidence: 0.98,
          kind: 'secret_leak',
        },
      ],
    });
    expect(review.findings).toHaveLength(1);
    expect(review.score).toBe(61);
  });

  it('lethal-trifecta Finding variant', () => {
    const f = Finding.parse({
      id: 'f2',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Lethal trifecta',
      file: 'src/api/public/webhooks.ts',
      start_line: 61,
      end_line: 74,
      rationale: 'all three legs present',
      confidence: 0.79,
      kind: 'lethal_trifecta',
      trifecta_components: ['private_data_access', 'untrusted_input', 'exfil_path'],
      evidence: [{ component: 'untrusted_input', file: 'src/api/public/webhooks.ts', line: 61 }],
    });
    expect(f.trifecta_components).toContain('exfil_path');
  });

  it('Intent / BlastRadius / Risks / PrHistory', () => {
    expect(() =>
      Intent.parse({ intent: 'x', in_scope: ['a'], out_of_scope: ['b'] }),
    ).not.toThrow();
    const blast = {
      changed_symbols: [{ name: 'rateLimit', file: 'a.ts', kind: 'function' }],
      downstream: [
        {
          symbol: 'rateLimit',
          callers: [{ name: 'publicRouter', file: 'b.ts', line: 23 }],
          endpoints_affected: ['GET /x'],
          crons_affected: ['c'],
        },
      ],
      summary: 's',
    };
    expect(() => BlastRadius.parse(blast)).not.toThrow();
    expect(() =>
      BlastRadius.parse({ ...blast, degraded: true, reason: 'index_partial' }),
    ).not.toThrow();
    expect(() => BlastRadius.parse({ ...blast, reason: 'stale' })).toThrow();
    expect([...BlastDegradedReason.options].sort()).toEqual([
      'flag_off',
      'index_failed',
      'index_partial',
      'no_data',
      'repo_too_large',
    ]);
    expect(() =>
      Risks.parse({
        risks: [{ kind: 'security', title: 't', explanation: 'e', severity: 'high', file_refs: [] }],
      }),
    ).not.toThrow();
    expect(() =>
      PrHistory.parse({
        history: [
          {
            pr_number: 401,
            title: 't',
            merged_at: '2026-03-18',
            author: 'a',
            files_overlap: [],
            notes: 'n',
          },
        ],
      }),
    ).not.toThrow();
  });

  it('SmartDiff (data.jsx DIFF)', () => {
    const d = SmartDiff.parse({
      groups: [
        {
          role: 'core',
          files: [{ path: 'a.ts', additions: 84, deletions: 0, finding_lines: [28, 52] }],
        },
        {
          role: 'tests',
          files: [{ path: 'a.test.ts', additions: 10, deletions: 0, finding_lines: [] }],
        },
        {
          role: 'docs',
          files: [{ path: 'README.md', additions: 2, deletions: 1, finding_lines: [] }],
        },
      ],
      split_suggestion: { too_big: false, total_lines: 285, proposed_splits: [] },
    });
    expect(d.groups[0]!.role).toBe('core');
    expect(d.groups.map((g) => g.role)).toEqual(['core', 'tests', 'docs']);
    expect(() => SmartDiffRole.parse('docs')).not.toThrow();
  });

  it('Conformance / OnboardingTourState / EvalRun / MemoryItem', () => {
    expect(() =>
      Conformance.parse({
        spec_id: 's1',
        spec_title: 'Spec',
        items: [{ requirement: 'r', status: 'implemented' }],
        completeness_pct: 80,
      }),
    ).not.toThrow();
    const index = {
      ready: true,
      reason: null,
      status: 'partial',
      indexed_sha: 'beef0000beef0000beef0000beef0000beef0000',
      file_count: 12450,
    };
    expect(() =>
      OnboardingTourState.parse({
        repo_id: 'r1',
        tour: null,
        generating: false,
        last_error: null,
        index,
      }),
    ).not.toThrow();
    expect(() =>
      OnboardingTourState.parse({
        repo_id: 'r1',
        tour: {
          repo_id: 'r1',
          generated_at: '2026-11-03T10:00:00.000Z',
          commit_sha: 'c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00',
          index_file_count: 12450,
          index_status: 'partial',
          architecture: {
            summary_md: 'Entry is `src/server.ts`.',
            diagram: null,
            links: [{ label: 'Server', path: 'src/server.ts' }],
          },
          critical_paths: {
            source: 'file_rank',
            items: [
              { path: 'src/server.ts', note: null },
              { path: 'src/middleware/auth.ts', note: 'Token validation' },
            ],
          },
          run_steps: [{ command: 'pnpm install' }],
          reading_path: [{ path: 'src/server.ts', reason: null }],
          first_tasks: [{ title: 'Add a header', description: 'One line.', paths: ['src/server.ts'] }],
        },
        generating: true,
        last_error: 'timed out',
        index,
      }),
    ).not.toThrow();
    expect(() =>
      OnboardingTourState.parse({
        repo_id: 'r1',
        tour: null,
        generating: false,
        last_error: null,
        index: { ...index, status: 'unknown' },
      }),
    ).toThrow();
    expect(() =>
      EvalRun.parse({
        recall: 0.82,
        precision: 0.91,
        citation_accuracy: 0.95,
        traces_passed: 17,
        traces_total: 20,
        duration_ms: 12000,
        cost_usd: 0.23,
        per_trace: [{ name: 't01', pass: true, expected: 'x', actual: 'x' }],
      }),
    ).not.toThrow();
    expect(() =>
      MemoryItem.parse({
        content: 'c',
        scope: 'team',
        kind: 'decision',
        confidence: 0.92,
        sources: [{ pr: 401, context: 'ctx' }],
      }),
    ).not.toThrow();
  });

  it('the seeded onboarding tour matches OnboardingTourContent', () => {
    expect(() => OnboardingTourContent.parse(SEED_ONBOARDING_TOUR)).not.toThrow();
  });

  it('RunTrace (data2.jsx TRACE single-document)', () => {
    const trace = RunTrace.parse({
      config: { agent: 'Security Reviewer', version: 'v7', model: 'gpt-4.1', pr: 482, source: 'local' },
      stats: { duration_ms: 8200, tokens_in: 14820, tokens_out: 1240, cost_usd: 0.06, findings: 3, grounding: '3/3 passed' },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [{ tool: 'read_file', args: "'src/config.ts'", meta: '1,240 bytes', ms: 120 }],
      raw_output: '{}',
      memory_pulled: [{ pr: 288, text: 'verified via stripe-signature' }],
      specs_read: ['specs/security-baseline.md'],
      log: [{ t: '00.00', kind: 'info', msg: 'started' }],
    });
    expect(trace.tool_calls).toHaveLength(1);
  });
});

describe('platform DTOs', () => {
  it('Settings defaults + passthrough', () => {
    const s = Settings.parse({ extra_key: 'x' });
    expect(s.theme).toBe('dark');
    expect((s as Record<string, unknown>).extra_key).toBe('x');
  });

  it('Repo + PrDetail', () => {
    expect(() =>
      Repo.parse({
        id: 'r1',
        workspace_id: 'w1',
        owner: 'acme',
        name: 'payments-api',
        full_name: 'acme/payments-api',
        default_branch: 'main',
        clone_path: null,
        last_polled_at: null,
        created_by: null,
      }),
    ).not.toThrow();
    expect(() =>
      PrDetail.parse({
        number: 482,
        title: 't',
        author: 'a',
        branch: 'b',
        base: 'main',
        head_sha: 'sha',
        additions: 1,
        deletions: 0,
        files_count: 1,
        status: 'open',
        files: [],
        commits: [],
      }),
    ).not.toThrow();
  });
});

describe('project context contracts', () => {
  it('AttachmentPath accepts repo-relative Markdown paths', () => {
    for (const p of ['specs/a.md', 'docs/x/y.MD', 'a/b/c.md']) {
      expect(AttachmentPath.safeParse(p).success, p).toBe(true);
    }
  });

  it('AttachmentPath rejects unsafe or non-Markdown paths', () => {
    const bad = [
      '/etc/passwd.md',
      '../a.md',
      'a/../b.md',
      './a.md',
      'a//b.md',
      'a\\b.md',
      '.git/x.md',
      'node_modules/x/docs/a.md',
      'a.txt',
      '',
      'a\u0000b.md',
      'a\nb.md',
      `${'a'.repeat(510)}.md`,
    ];
    expect(bad.at(-1)).toHaveLength(513);
    for (const p of bad) {
      expect(AttachmentPath.safeParse(p).success, JSON.stringify(p)).toBe(false);
    }
    expect(AttachmentPath.safeParse(`${'a'.repeat(509)}.md`).success).toBe(true);
  });

  it('SetContextPathsInput caps the list at MAX_ATTACHED_DOCS', () => {
    const paths = (n: number): string[] => Array.from({ length: n }, (_, i) => `docs/${i}.md`);
    expect(SetContextPathsInput.safeParse({ paths: paths(MAX_ATTACHED_DOCS) }).success).toBe(true);
    expect(SetContextPathsInput.safeParse({ paths: paths(MAX_ATTACHED_DOCS + 1) }).success).toBe(false);
    expect(SetContextPathsInput.safeParse({ paths: ['../x.md'] }).success).toBe(false);
  });

  const trace = {
    config: { agent: 'a', model: 'm' },
    stats: {
      duration_ms: 1,
      tokens_in: 1,
      tokens_out: 1,
      cost_usd: null,
      findings: 0,
      grounding: '0/0',
    },
    prompt_assembly: { system: 's', user: 'u' },
    tool_calls: [],
    raw_output: '',
    memory_pulled: [],
    specs_read: [],
    log: [],
  };

  it('RunTrace parses with and without project_context', () => {
    expect(RunTrace.parse(trace).project_context).toBeUndefined();
    const withCtx = RunTrace.parse({
      ...trace,
      specs_read: ['specs/a.md'],
      project_context: {
        commit: 'a'.repeat(40),
        docs: [
          { path: 'specs/a.md', tokens: 10, status: 'included' },
          { path: 'docs/b.md', tokens: 900, status: 'skipped_budget' },
          { path: 'docs/c.md', tokens: 0, status: 'missing' },
        ],
      },
    });
    expect(withCtx.project_context?.docs).toHaveLength(3);
    expect(
      RunTrace.safeParse({ ...trace, project_context: { commit: null, docs: [{ path: 'a.md', tokens: 1, status: 'bogus' }] } })
        .success,
    ).toBe(false);
  });

  it('Agent and Skill default context_paths to []', () => {
    const agent = Agent.parse({
      id: 'a1',
      name: 'n',
      description: 'd',
      provider: 'openai',
      model: 'm',
      system_prompt: 's',
      enabled: true,
      version: 1,
    });
    expect(agent.context_paths).toEqual([]);
    const skill = Skill.parse({
      id: 's1',
      name: 'n',
      description: 'd',
      type: 'custom',
      source: 'manual',
      body: 'b',
      enabled: true,
      version: 1,
    });
    expect(skill.context_paths).toEqual([]);
    expect(Skill.parse({ ...skill, context_paths: ['specs/a.md'] }).context_paths).toEqual(['specs/a.md']);
  });

  it('ProjectContextList parses a sample', () => {
    const list = ProjectContextList.parse({
      repo_id: 'r1',
      status: 'ok',
      globs: ['**/{specs,docs,insights}/**/*.md'],
      commit: 'b'.repeat(40),
      scanned_at: '2026-11-03T10:00:00.000Z',
      total: 1,
      budget_tokens: 20000,
      docs: [{ path: 'specs/a.md', type: 'specs', size: 120, tokens: 30, used_by: 2 }],
    });
    expect(list.docs[0]!.type).toBe('specs');
    expect(
      ProjectContextList.safeParse({ ...list, status: 'broken' }).success,
    ).toBe(false);
  });
});
