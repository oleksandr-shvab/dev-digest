import type { Container } from '../../platform/container.js';
import { resolveFeatureModel } from '../settings/feature-models.js';

export type ChangelogRole = 'source' | 'test' | 'docs' | 'config' | 'other';

export interface ChangelogEntry {
  title: string;
  headline: string;
  groups: { role: ChangelogRole; paths: string[] }[];
  blocking: number;
  model: string;
}

const ROLE_ORDER: ChangelogRole[] = ['source', 'config', 'docs', 'test', 'other'];

export function groupByRole(
  files: { path: string; role: string }[],
): { role: ChangelogRole; paths: string[] }[] {
  const buckets = new Map<ChangelogRole, string[]>();
  for (const file of files) {
    const role = (ROLE_ORDER as string[]).includes(file.role) ? (file.role as ChangelogRole) : 'other';
    buckets.set(role, [...(buckets.get(role) ?? []), file.path]);
  }
  return ROLE_ORDER.filter((role) => buckets.has(role)).map((role) => ({
    role,
    paths: buckets.get(role)!.sort(),
  }));
}

export function pickHeadline(issueTitles: string[], fallback: string): string {
  const first = issueTitles.find((t) => t.trim().length > 0);
  return (first ?? fallback).replace(/\s+/g, ' ').trim().slice(0, 120);
}

export function renderEntry(input: Omit<ChangelogEntry, 'model'>, model: string): ChangelogEntry {
  return { ...input, model };
}

export async function summaryModelFor(container: Container, workspaceId: string): Promise<string> {
  const choice = await resolveFeatureModel(container, workspaceId, 'intent');
  return `${choice.provider}/${choice.model}`;
}
