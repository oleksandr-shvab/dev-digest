import { describe, it, expect } from "vitest";
import type { ProjectContextDoc } from "@devdigest/shared";
import { buildRows, costedDocs, filterByPath, moveItem, planBudget, serializePreview, totalTokens } from "./helpers";

const doc = (path: string, tokens: number, type: ProjectContextDoc["type"] = "specs"): ProjectContextDoc => ({
  path,
  type,
  size: tokens * 4,
  tokens,
  used_by: 0,
});

describe("planBudget", () => {
  it("skips a whole doc that would exceed the budget and still includes a later smaller doc", () => {
    const ordered = [
      { path: "a.md", tokens: 100 },
      { path: "big.md", tokens: 25_000 },
      { path: "c.md", tokens: 1_000 },
    ];
    const { included, skipped } = planBudget(ordered, 20_000);
    expect(included.map((d) => d.path)).toEqual(["a.md", "c.md"]);
    expect(skipped.map((d) => d.path)).toEqual(["big.md"]);
  });

  it("always skips a single doc larger than the whole budget", () => {
    const { included, skipped } = planBudget([{ path: "huge.md", tokens: 500 }], 400);
    expect(included).toEqual([]);
    expect(skipped).toHaveLength(1);
  });

  it("fits a doc that exactly reaches the budget", () => {
    const { included } = planBudget([{ path: "a.md", tokens: 400 }], 400);
    expect(included).toHaveLength(1);
  });
});

describe("rows and totals", () => {
  const docs = [doc("specs/b.md", 20), doc("docs/a.md", 10, "docs"), doc("insights/c.md", 5, "insights")];

  it("puts attached rows first in their order, then the rest by path, and flags a missing path", () => {
    const rows = buildRows(docs, ["specs/b.md", "specs/gone.md"]);
    expect(rows.map((r) => r.path)).toEqual(["specs/b.md", "specs/gone.md", "docs/a.md", "insights/c.md"]);
    expect(rows.map((r) => r.notFound)).toEqual([false, true, false, false]);
  });

  it("does not flag anything as missing while the list is not loaded", () => {
    const rows = buildRows(undefined, ["specs/b.md"]);
    expect(rows).toEqual([{ path: "specs/b.md", doc: null, attached: true, notFound: false }]);
  });

  it("sums the tokens of the listed docs for the given paths, ignoring unlisted ones", () => {
    const costed = costedDocs(docs, ["docs/a.md", "specs/gone.md", "specs/b.md"]);
    expect(costed.map((d) => d.path)).toEqual(["docs/a.md", "specs/b.md"]);
    expect(totalTokens(costed)).toBe(30);
  });

  it("filters by path ignoring case and moves an item", () => {
    expect(filterByPath(docs, "DOCS/").map((d) => d.path)).toEqual(["docs/a.md"]);
    expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
  });
});

describe("serializePreview", () => {
  it("lists the heading and the paths in order, and carries no document text", () => {
    expect(serializePreview(["specs/a.md", "docs/b.md"])).toBe("## Project context\n- specs/a.md\n- docs/b.md");
    expect(serializePreview([])).toBe("## Project context");
  });
});
