/** Number of editor lines for a body (an empty body still has line 1). */
export function lineCount(text: string): number {
  return text.split("\n").length;
}

/** Insert `insert` over the [start, end) selection; returns the new text and caret position. */
export function insertAt(text: string, start: number, end: number, insert: string): { text: string; caret: number } {
  return { text: text.slice(0, start) + insert + text.slice(end), caret: start + insert.length };
}
