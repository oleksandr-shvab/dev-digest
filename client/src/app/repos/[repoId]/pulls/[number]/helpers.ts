/** Pure helpers for the PR detail page: the tab and the Files changed focus live in the URL. */
import type { DiffFocus } from "@/components/diff-viewer";

/** Query string for switching tab: a file/line target belongs to the Files changed tab only. */
export function tabSearch(search: URLSearchParams, tab: string): string {
  const sp = new URLSearchParams(search.toString());
  sp.set("tab", tab);
  sp.delete("file");
  sp.delete("line");
  return sp.toString();
}

/** Query string that opens Files changed on `path` (and `line`); other params are kept. */
export function fileFocusSearch(search: URLSearchParams, path: string, line: number | null): string {
  const sp = new URLSearchParams(search.toString());
  sp.set("tab", "diff");
  sp.set("file", path);
  if (line === null) sp.delete("line");
  else sp.set("line", String(line));
  return sp.toString();
}

/** The focus target in the URL, or null. A `line` that is not a positive integer is ignored. */
export function focusFromSearch(search: URLSearchParams): DiffFocus | null {
  const path = search.get("file");
  if (!path) return null;
  const raw = search.get("line");
  const line = raw !== null && /^\d+$/.test(raw) ? Number(raw) : NaN;
  return { path, line: Number.isSafeInteger(line) && line > 0 ? line : null };
}
