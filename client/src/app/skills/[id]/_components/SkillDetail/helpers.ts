import type { SkillVersion } from "@devdigest/shared";

/** File name of an imported skill, read from its oldest version's "Imported from <file>" message. */
export function importedFileName(versions: SkillVersion[] | undefined): string | null {
  if (!versions?.length) return null;
  const first = versions.reduce((a, b) => (b.version < a.version ? b : a));
  return /^Imported from (.+)$/.exec(first.message)?.[1] ?? null;
}
