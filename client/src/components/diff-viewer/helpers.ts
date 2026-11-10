/** Pure helpers for the DiffViewer. */
import { HUNK_HEADER_RE } from "./constants";

export interface Line {
  kind: "add" | "del" | "ctx" | "hunk";
  text: string;
  oldNo?: number;
  newNo?: number;
}

/** Parse unified-diff patch text into renderable lines with old/new line numbers. */
export function parsePatch(patch: string | null | undefined): Line[] {
  if (!patch) return [];
  const out: Line[] = [];
  let oldNo = 0;
  let newNo = 0;
  for (const raw of patch.split("\n")) {
    if (raw.startsWith("@@")) {
      const m = raw.match(HUNK_HEADER_RE);
      if (m) {
        oldNo = parseInt(m[1]!, 10);
        newNo = parseInt(m[2]!, 10);
      }
      out.push({ kind: "hunk", text: raw });
    } else if (raw.startsWith("+")) {
      out.push({ kind: "add", text: raw.slice(1), newNo });
      newNo++;
    } else if (raw.startsWith("-")) {
      out.push({ kind: "del", text: raw.slice(1), oldNo });
      oldNo++;
    } else if (raw.startsWith("\\")) {
      // "\ No newline at end of file": neither added, removed nor context, and it has no line number.
      continue;
    } else {
      out.push({ kind: "ctx", text: raw.slice(raw.startsWith(" ") ? 1 : 0), oldNo, newNo });
      oldNo++;
      newNo++;
    }
  }
  return out;
}

/** A file (and optionally a new-side line) the viewer should open, scroll to and mark. */
export interface DiffFocus {
  path: string;
  line: number | null;
}

/** Stable identity of a focus target; a new key means "open and scroll again". */
export function focusKey(f: DiffFocus | null | undefined): string | null {
  return f ? `${f.path}:${f.line ?? ""}` : null;
}

export function isFocusedFile(focus: DiffFocus | null | undefined, path: string): boolean {
  return !!focus && focus.path === path;
}

/** The focus line is a new-side number, so deletions and hunk headers never match. */
export function isFocusedLine(focus: DiffFocus | null | undefined, path: string, ln: Line): boolean {
  if (!focus || focus.path !== path || focus.line === null) return false;
  return ln.kind !== "hunk" && ln.kind !== "del" && ln.newNo === focus.line;
}

/** The file is focused but no rendered line carries the target, so the card itself is scrolled to. */
export function shouldScrollToCard(focus: DiffFocus | null | undefined, path: string, lines: Line[]): boolean {
  return isFocusedFile(focus, path) && !lines.some((ln) => isFocusedLine(focus, path, ln));
}
