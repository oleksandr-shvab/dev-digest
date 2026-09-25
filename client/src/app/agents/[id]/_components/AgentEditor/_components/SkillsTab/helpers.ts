import type { AgentSkill, Skill } from "@devdigest/shared";
import { estimateTokens } from "@/lib/tokens";

/** A skill reaches the prompt only when the per-agent link AND the global switch are on. */
export const isActive = (a: AgentSkill): boolean => a.enabled && a.skill.enabled;

export const countActive = (items: AgentSkill[]): number => items.filter(isActive).length;

/** Estimated tokens of everything that would be injected (advisory, ceil(chars / 4)). */
export function totalTokens(items: AgentSkill[]): number {
  return items.filter(isActive).reduce((sum, a) => sum + estimateTokens(a.skill.body), 0);
}

/** Case-insensitive filter on skill name. */
export function filterLinked(items: AgentSkill[], query: string): AgentSkill[] {
  const q = query.trim().toLowerCase();
  return q ? items.filter((a) => a.skill.name.toLowerCase().includes(q)) : items;
}

export const toggleEnabled = (items: AgentSkill[], skillId: string, enabled: boolean): AgentSkill[] =>
  items.map((a) => (a.skill.id === skillId ? { ...a, enabled } : a));

export const unlink = (items: AgentSkill[], skillId: string): AgentSkill[] =>
  items.filter((a) => a.skill.id !== skillId);

/** Append a skill at the end, enabled. */
export const link = (items: AgentSkill[], skill: Skill): AgentSkill[] => [
  ...items,
  { skill, order: items.length, enabled: true },
];

/** Workspace skills not linked yet, as `SearchableSelect` options. */
export function linkableOptions(all: Skill[], items: AgentSkill[]): { value: string; label: string }[] {
  const linked = new Set(items.map((a) => a.skill.id));
  return all.filter((sk) => !linked.has(sk.id)).map((sk) => ({ value: sk.id, label: sk.name }));
}
