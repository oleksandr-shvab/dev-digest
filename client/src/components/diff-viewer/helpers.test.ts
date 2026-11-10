import { describe, it, expect } from "vitest";
import { focusKey, isFocusedFile, isFocusedLine, parsePatch, shouldScrollToCard } from "./helpers";

const PATCH = "@@ -10,3 +10,3 @@\n ctx a\n-old b\n+new b\n ctx c";
const lines = parsePatch(PATCH);
const byText = (text: string) => lines.find((l) => l.text === text)!;

describe("diff focus helpers", () => {
  it("isFocusedLine matches an add or context line by new number, never a deletion or hunk", () => {
    const focus = { path: "a.ts", line: 11 };
    expect(isFocusedLine(focus, "a.ts", byText("new b"))).toBe(true);
    // the deleted line has no new-side number; the hunk header never matches
    expect(isFocusedLine(focus, "a.ts", byText("old b"))).toBe(false);
    expect(isFocusedLine({ path: "a.ts", line: 10 }, "a.ts", byText("ctx a"))).toBe(true);
    expect(isFocusedLine({ path: "a.ts", line: 10 }, "a.ts", lines[0]!)).toBe(false);
    // other file, or no line
    expect(isFocusedLine(focus, "b.ts", byText("new b"))).toBe(false);
    expect(isFocusedLine({ path: "a.ts", line: null }, "a.ts", byText("new b"))).toBe(false);
    expect(isFocusedLine(null, "a.ts", byText("new b"))).toBe(false);
  });

  it("shouldScrollToCard is true for a file focus without a line or with a line not in the patch", () => {
    expect(shouldScrollToCard({ path: "a.ts", line: null }, "a.ts", lines)).toBe(true);
    expect(shouldScrollToCard({ path: "a.ts", line: 999 }, "a.ts", lines)).toBe(true);
    expect(shouldScrollToCard({ path: "a.ts", line: 11 }, "a.ts", lines)).toBe(false);
    expect(shouldScrollToCard({ path: "a.ts", line: null }, "b.ts", lines)).toBe(false);
    expect(shouldScrollToCard(undefined, "a.ts", lines)).toBe(false);
  });

  it("focusKey and isFocusedFile identify the target", () => {
    expect(focusKey({ path: "a.ts", line: 3 })).toBe("a.ts:3");
    expect(focusKey({ path: "a.ts", line: null })).toBe("a.ts:");
    expect(focusKey(null)).toBeNull();
    expect(isFocusedFile({ path: "a.ts", line: null }, "a.ts")).toBe(true);
    expect(isFocusedFile({ path: "a.ts", line: null }, "b.ts")).toBe(false);
  });
});

describe("focus line numbering matches the server's first changed line", () => {
  it("a '\\ No newline at end of file' marker does not shift the new-side numbers (AC-20)", () => {
    // The server cites new line 2 here (firstChangedLine skips the marker); the viewer must mark that row.
    const patch = "@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+c\n\\ No newline at end of file";
    const parsed = parsePatch(patch);
    const added = parsed.find((l) => l.kind === "add")!;
    expect(isFocusedLine({ path: "a.ts", line: 2 }, "a.ts", added)).toBe(true);
    expect(shouldScrollToCard({ path: "a.ts", line: 2 }, "a.ts", parsed)).toBe(false);
  });
});

