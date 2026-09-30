import type { ConventionCandidate, ConventionCategory, ConventionSkillDraft } from '@devdigest/shared';
import { CATEGORY_LABEL, CATEGORY_ORDER, DEFAULT_SKILL_DESCRIPTION, DEFAULT_SKILL_NAME } from './constants.js';

/**
 * Build the `repo-conventions` skill body from accepted candidates (Decision
 * 10) — plain code, no model call. Grouped by category in `CATEGORY_ORDER`,
 * confidence desc within a category.
 */
export function buildSkillDraftBody(repoFullName: string, candidates: ConventionCandidate[]): string {
  const byCategory = new Map<ConventionCategory, ConventionCandidate[]>();
  for (const c of candidates) {
    const list = byCategory.get(c.category);
    if (list) list.push(c);
    else byCategory.set(c.category, [c]);
  }

  const sections: string[] = [];
  for (const category of CATEGORY_ORDER) {
    const items = byCategory.get(category);
    if (!items?.length) continue;
    const ordered = [...items].sort((a, b) => b.confidence - a.confidence);
    const lines = ordered.map((c) => `- ${c.rule} — e.g. \`${c.evidence_path}:${c.evidence_line}\``);
    sections.push(`## ${CATEGORY_LABEL[category]}\n${lines.join('\n')}`);
  }

  const intro = `Conventions extracted from ${repoFullName}. Flag code in a PR that breaks one of them; cite the rule.`;
  return [intro, ...sections].join('\n\n');
}

export function buildSkillDraft(repoFullName: string, candidates: ConventionCandidate[]): ConventionSkillDraft {
  return {
    name: DEFAULT_SKILL_NAME,
    description: DEFAULT_SKILL_DESCRIPTION,
    type: 'convention',
    body: buildSkillDraftBody(repoFullName, candidates),
    evidence_files: [...new Set(candidates.map((c) => c.evidence_path))],
  };
}
