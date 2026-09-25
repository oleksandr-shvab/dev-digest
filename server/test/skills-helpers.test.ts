import { describe, it, expect } from 'vitest';
import {
  activeSkillLinks,
  defaultVersionMessage,
  formatSkillBlock,
  formatTokenCount,
  isUniqueViolation,
  planSkillUpdate,
  skillsLogLines,
  slugifySkillName,
  type RunSkillLink,
} from '../src/modules/skills/helpers.js';
import {
  acceptRate,
  buildStats,
  buildSummary,
  EMPTY_COUNTS,
  pullRate,
  ratio,
  windowStart,
} from '../src/modules/skills/stats.js';
import {
  sameSkillLinks,
  upgradeVersionConfig,
} from '../src/modules/agents/helpers.js';
import { AgentVersionConfig } from '@devdigest/shared';
import type { SkillRow } from '../src/db/rows.js';

const existing = {
  name: 'corner-cases',
  description: 'Boundary inputs.',
  type: 'rubric' as const,
  body: 'Check edges.',
  enabled: true,
};

describe('formatSkillBlock', () => {
  it('renders `### name (vN)`, description, blank line, body', () => {
    expect(
      formatSkillBlock({ name: 'pr-quality-rubric', version: 5, description: 'Rubric.', body: 'Body text' }),
    ).toBe('### pr-quality-rubric (v5)\nRubric.\n\nBody text');
  });
});

describe('planSkillUpdate — version rules (Decision 6)', () => {
  it('body / description / type changes bump the version', () => {
    expect(planSkillUpdate(existing, { body: 'new' })).toMatchObject({ bump: true, changed: true });
    expect(planSkillUpdate(existing, { description: 'new' }).bump).toBe(true);
    expect(planSkillUpdate(existing, { type: 'security' }).bump).toBe(true);
  });

  it('renaming or toggling enabled changes the row but never bumps', () => {
    expect(planSkillUpdate(existing, { name: 'renamed' })).toMatchObject({ bump: false, changed: true });
    expect(planSkillUpdate(existing, { enabled: false })).toMatchObject({ bump: false, changed: true });
  });

  it('identical values are a no-op (no bump, nothing to write)', () => {
    const plan = planSkillUpdate(existing, { body: existing.body, name: existing.name, enabled: true });
    expect(plan).toEqual({ set: {}, bump: false, changed: false });
  });

  it('only changed fields end up in `set`', () => {
    expect(planSkillUpdate(existing, { body: 'x', name: existing.name }).set).toEqual({ body: 'x' });
  });
});

describe('defaultVersionMessage (Decision 7)', () => {
  it('Initial version for manual v1', () => {
    expect(defaultVersionMessage({ initial: true, source: 'manual' })).toBe('Initial version');
    expect(defaultVersionMessage({ initial: true })).toBe('Initial version');
  });
  it('Imported from <file> for imported v1', () => {
    expect(defaultVersionMessage({ initial: true, source: 'imported_file', fileName: 'a.zip' })).toBe(
      'Imported from a.zip',
    );
  });
  it('Edited otherwise', () => {
    expect(defaultVersionMessage({ initial: false })).toBe('Edited');
  });
  it('a non-blank user message wins; blank falls back', () => {
    expect(defaultVersionMessage({ initial: false, message: ' tightened rubric ' })).toBe('tightened rubric');
    expect(defaultVersionMessage({ initial: false, message: '   ' })).toBe('Edited');
  });
});

describe('slugifySkillName / isUniqueViolation', () => {
  it('produces kebab-case ≤ 64 chars matching the contract', () => {
    expect(slugifySkillName('  Über Cool_Skill!! ')).toBe('uber-cool-skill');
    expect(slugifySkillName('***')).toBe('skill');
    expect(slugifySkillName('a'.repeat(100))).toHaveLength(64);
  });
  it('detects postgres unique violations', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ cause: { code: '23505' } })).toBe(true);
    expect(isUniqueViolation(new Error('x'))).toBe(false);
  });
});

function link(name: string, order: number, o: { linkOn?: boolean; skillOn?: boolean } = {}): RunSkillLink {
  return {
    order,
    enabled: o.linkOn ?? true,
    skill: { id: name, name, enabled: o.skillOn ?? true } as SkillRow,
  };
}

describe('activeSkillLinks (Decisions 2–3)', () => {
  it('keeps only skills enabled globally AND per agent, in order', () => {
    const out = activeSkillLinks([
      link('c', 2),
      link('off-global', 1, { skillOn: false }),
      link('a', 0),
      link('off-agent', 3, { linkOn: false }),
      link('b', 1),
    ]);
    expect(out.map((l) => l.skill.name)).toEqual(['a', 'b', 'c']);
  });
  it('empty in → empty out', () => {
    expect(activeSkillLinks([])).toEqual([]);
  });
});

describe('skillsLogLines', () => {
  it('header + one line per skill', () => {
    expect(
      skillsLogLines([
        { name: 'pr-quality-rubric', version: 5, tokens: 410 },
        { name: 'corner-cases', version: 1, tokens: 800 },
      ]),
    ).toEqual([
      'Skills: 2 active · ~1.2k tokens',
      '  pr-quality-rubric v5 · 410 tokens',
      '  corner-cases v1 · 800 tokens',
    ]);
  });
  it('no lines when no skills are active', () => {
    expect(skillsLogLines([])).toEqual([]);
  });
  it('formatTokenCount', () => {
    expect(formatTokenCount(999)).toBe('999');
    expect(formatTokenCount(1500)).toBe('1.5k');
  });
});

describe('stats ratios (null rules)', () => {
  it('ratio is null on a zero denominator and clamped to 0..1', () => {
    expect(ratio(3, 0)).toBeNull();
    expect(ratio(0, 5)).toBe(0);
    expect(ratio(5, 4)).toBe(1);
  });
  it('pull_rate = applied / linked-agent runs', () => {
    expect(pullRate(3, 4)).toBe(0.75);
    expect(pullRate(0, 0)).toBeNull();
  });
  it('accept_rate = accepted / (accepted + dismissed); null when nothing triaged', () => {
    expect(acceptRate(1, 3)).toBe(0.25);
    expect(acceptRate(0, 0)).toBeNull();
    expect(acceptRate(0, 2)).toBe(0);
  });
  it('buildSummary maps counts to the contract', () => {
    expect(
      buildSummary({ ...EMPTY_COUNTS, usedBy: 2, appliedRuns: 1, linkedAgentRuns: 2, accepted: 1, dismissed: 1 }),
    ).toEqual({ used_by: 2, pull_rate: 0.5, accept_rate: 0.5 });
    expect(buildSummary(EMPTY_COUNTS)).toEqual({ used_by: 0, pull_rate: null, accept_rate: null });
  });
  it('buildStats sorts categories desc by count and carries the 30-day window', () => {
    const s = buildStats({ ...EMPTY_COUNTS, findings: 6 }, [], [
      { category: 'b', count: 1 },
      { category: 'a', count: 1 },
      { category: 'z', count: 4 },
    ]);
    expect(s.window_days).toBe(30);
    expect(s.findings).toBe(6);
    expect(s.by_category.map((c) => c.category)).toEqual(['z', 'a', 'b']);
  });
  it('windowStart is 30 days back', () => {
    const now = new Date('2026-09-30T00:00:00Z');
    expect(windowStart(now).toISOString()).toBe('2026-08-31T00:00:00.000Z');
  });
});

describe('agent skill link helpers (Decision 9)', () => {
  it('sameSkillLinks compares ids, order and enabled', () => {
    const a = [{ skill_id: 'x', enabled: true }, { skill_id: 'y', enabled: false }];
    expect(sameSkillLinks(a, [...a])).toBe(true);
    expect(sameSkillLinks(a, [a[1]!, a[0]!])).toBe(false);
    expect(sameSkillLinks(a, [a[0]!, { skill_id: 'y', enabled: true }])).toBe(false);
    expect(sameSkillLinks(a, [a[0]!])).toBe(false);
  });

  it('upgradeVersionConfig turns legacy string[] skills into the snapshot shape', () => {
    const legacy = {
      provider: 'openai', model: 'm', system_prompt: 's', output_schema: null,
      strategy: 'single-pass', ci_fail_on: 'critical', repo_intel: true,
      skills: ['11111111-1111-1111-1111-111111111111'],
    };
    const cfg = AgentVersionConfig.parse(upgradeVersionConfig(legacy));
    expect(cfg.skills).toEqual([
      { skill_id: '11111111-1111-1111-1111-111111111111', version: 1, enabled: true },
    ]);
    // already-new shape is untouched
    const current = { ...legacy, skills: [{ skill_id: 'a', version: 3, enabled: false }] };
    expect(AgentVersionConfig.parse(upgradeVersionConfig(current)).skills).toEqual(current.skills);
  });
});
