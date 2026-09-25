import { diffLines } from "diff";
import type { SkillVersion } from "@devdigest/shared";

export interface DiffLine {
  kind: "add" | "del" | "ctx";
  text: string;
}

export interface DiffSection {
  /** Field name; also the i18n key suffix under `skills.versions.`. */
  key: "body" | "description" | "type";
  lines: DiffLine[];
}

/** Line diff of two texts as a flat list of added / removed / unchanged lines. */
export function toDiffLines(from: string, to: string): DiffLine[] {
  return diffLines(from, to).flatMap((part) => {
    const lines = part.value.split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    const kind = part.added ? "add" : part.removed ? "del" : "ctx";
    return lines.map((text) => ({ kind, text }) as DiffLine);
  });
}

/** Sections for a `from → to` diff: the body always, description/type only if they differ. */
export function buildVersionDiff(from: SkillVersion, to: SkillVersion): DiffSection[] {
  const sections: DiffSection[] = [{ key: "body", lines: toDiffLines(from.body, to.body) }];
  if (from.description !== to.description) {
    sections.push({ key: "description", lines: toDiffLines(from.description, to.description) });
  }
  if (from.type !== to.type) {
    sections.push({ key: "type", lines: toDiffLines(from.type, to.type) });
  }
  return sections;
}

/** True when nothing was added or removed in any section. */
export function isUnchanged(sections: DiffSection[]): boolean {
  return sections.every((sec) => sec.lines.every((l) => l.kind === "ctx"));
}

/** `YYYY-MM-DD` from an ISO timestamp. */
export function formatDay(iso: string): string {
  return iso.slice(0, 10);
}
