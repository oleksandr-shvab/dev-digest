import { describe, it, expect } from "vitest";
import { fileFocusSearch, focusFromSearch, tabSearch } from "./helpers";

const sp = (q: string) => new URLSearchParams(q);

describe("PR page URL helpers", () => {
  it("fileFocusSearch sets tab=diff, file and line and keeps unrelated params", () => {
    const out = new URLSearchParams(fileFocusSearch(sp("tab=overview&trace=run-1"), "src/a b.ts", 12));
    expect(out.get("tab")).toBe("diff");
    expect(out.get("file")).toBe("src/a b.ts");
    expect(out.get("line")).toBe("12");
    expect(out.get("trace")).toBe("run-1");
    // a null line removes a previous one
    expect(new URLSearchParams(fileFocusSearch(sp("line=5"), "src/a.ts", null)).has("line")).toBe(false);
  });

  it("tabSearch drops the file and line target", () => {
    const out = new URLSearchParams(tabSearch(sp("tab=diff&file=src/a.ts&line=3&trace=t"), "findings"));
    expect(out.get("tab")).toBe("findings");
    expect(out.has("file")).toBe(false);
    expect(out.has("line")).toBe(false);
    expect(out.get("trace")).toBe("t");
  });

  it("focusFromSearch rejects a missing file and a bad line", () => {
    expect(focusFromSearch(sp("tab=diff"))).toBeNull();
    expect(focusFromSearch(sp("file=src/a.ts&line=7"))).toEqual({ path: "src/a.ts", line: 7 });
    expect(focusFromSearch(sp("file=src/a.ts"))).toEqual({ path: "src/a.ts", line: null });
    expect(focusFromSearch(sp("file=src/a.ts&line=abc"))).toEqual({ path: "src/a.ts", line: null });
    expect(focusFromSearch(sp("file=src/a.ts&line=0"))).toEqual({ path: "src/a.ts", line: null });
    expect(focusFromSearch(sp("file=src/a.ts&line=-3"))).toEqual({ path: "src/a.ts", line: null });
    expect(focusFromSearch(sp("file=src/a.ts&line=1.5"))).toEqual({ path: "src/a.ts", line: null });
  });
});
