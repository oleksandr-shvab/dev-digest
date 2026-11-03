import type { ProjectContextDoc } from "@devdigest/shared";

/** One row of the picker. `doc` is null when the list has no entry for the path. */
export interface PickerRow {
  path: string;
  doc: ProjectContextDoc | null;
  attached: boolean;
  /** Attached, but absent from a loaded docs list (AC-12). */
  notFound: boolean;
}

/** A doc with a known cost, as the budget planner sees it. */
export interface CostedDoc {
  path: string;
  tokens: number;
}

/** Attached rows first, in their saved order; then the unattached docs by path.
    `docs` undefined means "not loaded" — attached paths are then not flagged as missing. */
export function buildRows(docs: ProjectContextDoc[] | undefined, attached: string[]): PickerRow[] {
  const byPath = new Map((docs ?? []).map((d) => [d.path, d]));
  const attachedSet = new Set(attached);
  const attachedRows = attached.map<PickerRow>((path) => {
    const doc = byPath.get(path) ?? null;
    return { path, doc, attached: true, notFound: docs !== undefined && doc === null };
  });
  const rest = (docs ?? [])
    .filter((d) => !attachedSet.has(d.path))
    .sort((a, b) => a.path.localeCompare(b.path))
    .map<PickerRow>((doc) => ({ path: doc.path, doc, attached: false, notFound: false }));
  return [...attachedRows, ...rest];
}

/** Case-insensitive filter on the path. */
export function filterByPath<T extends { path: string }>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  return q ? items.filter((i) => i.path.toLowerCase().includes(q)) : items;
}

/** The listed docs for `paths`, in the order of `paths`; paths without a listed doc are left out. */
export function costedDocs(docs: ProjectContextDoc[] | undefined, paths: string[]): CostedDoc[] {
  const byPath = new Map((docs ?? []).map((d) => [d.path, d]));
  return paths.flatMap((path) => {
    const doc = byPath.get(path);
    return doc ? [{ path, tokens: doc.tokens }] : [];
  });
}

export const totalTokens = (docs: CostedDoc[]): number => docs.reduce((sum, d) => sum + d.tokens, 0);

/** Same rule as the server: walk in order, skip a whole doc that would exceed the budget, continue. */
export function planBudget<T extends CostedDoc>(ordered: T[], budget: number): { included: T[]; skipped: T[] } {
  const included: T[] = [];
  const skipped: T[] = [];
  let used = 0;
  for (const doc of ordered) {
    if (used + doc.tokens > budget) {
      skipped.push(doc);
    } else {
      included.push(doc);
      used += doc.tokens;
    }
  }
  return { included, skipped };
}

/** What a skill's attachments look like in the prompt: the heading and the paths, never doc text. */
export function serializePreview(paths: string[]): string {
  return ["## Project context", ...paths.map((p) => `- ${p}`)].join("\n");
}

/** `specs/a/b.md` → `b.md`. */
export const fileName = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

/** `specs/a/b.md` → `specs/a/`; a root-level file has no folder. */
export const folderOf = (path: string): string => {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i + 1);
};

/** Move the item at `from` to `to` (immutable). */
export function moveItem(paths: string[], from: number, to: number): string[] {
  const next = [...paths];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return paths;
  next.splice(to, 0, moved);
  return next;
}
