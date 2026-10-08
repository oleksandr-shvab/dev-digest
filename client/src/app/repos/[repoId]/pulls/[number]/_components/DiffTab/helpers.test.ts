import { describe, it, expect } from "vitest";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiff } from "@devdigest/shared";
import { countFilesWithFindings, groupFilesByRole, pickLatestReviewPerAgent } from "./helpers";

function review(id: string, kind: ReviewRecord["kind"], agent_id: string | null): ReviewRecord {
  return {
    id,
    pr_id: "pr-1",
    agent_id,
    run_id: null,
    kind,
    verdict: null,
    summary: null,
    score: null,
    model: null,
    created_at: "2026-01-01T00:00:00Z",
    findings: [],
  };
}

function finding(file: string, start_line: number, dismissed_at: string | null = null): FindingRecord {
  return {
    id: `${file}:${start_line}`,
    severity: "WARNING",
    category: "perf",
    title: "t",
    file,
    start_line,
    end_line: start_line,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at,
  };
}

const file = (path: string): PrFile => ({ path, additions: 1, deletions: 0 });

describe("pickLatestReviewPerAgent (twin of the server function; same cases)", () => {
  it("keeps the newest review of each agent, drops summaries, collapses null agents", () => {
    const two = [review("r1", "review", "a"), review("r2", "review", "b")];
    expect(pickLatestReviewPerAgent(two).map((r) => r.id)).toEqual(["r1", "r2"]);

    const sameAgent = [review("new", "review", "a"), review("old", "review", "a")];
    expect(pickLatestReviewPerAgent(sameAgent).map((r) => r.id)).toEqual(["new"]);

    const mixed = [review("s", "summary", "a"), review("n1", "review", null), review("n2", "review", null)];
    expect(pickLatestReviewPerAgent(mixed).map((r) => r.id)).toEqual(["n1"]);
  });
});

describe("groupFilesByRole", () => {
  it("keeps GitHub order within a group and appends a file the server did not place to core", () => {
    const smartDiff: SmartDiff = {
      groups: [
        { role: "core", files: [{ path: "src/b.ts", additions: 1, deletions: 0, finding_lines: [] }, { path: "src/a.ts", additions: 1, deletions: 0, finding_lines: [] }] },
        { role: "tests", files: [] },
        { role: "wiring", files: [] },
        { role: "docs", files: [{ path: "README.md", additions: 1, deletions: 0, finding_lines: [] }] },
        { role: "boilerplate", files: [] },
      ],
      split_suggestion: { too_big: false, total_lines: 3, proposed_splits: [] },
    };
    // GitHub order: a, README, b, late (unknown to the server)
    const groups = groupFilesByRole(smartDiff, [file("src/a.ts"), file("README.md"), file("src/b.ts"), file("src/late.ts")]);

    expect(groups.map((g) => g.role)).toEqual(["core", "tests", "wiring", "docs", "boilerplate"]);
    expect(groups[0]!.files.map((f) => f.path)).toEqual(["src/a.ts", "src/b.ts", "src/late.ts"]);
    expect(groups[3]!.files.map((f) => f.path)).toEqual(["README.md"]);
  });
});

describe("countFilesWithFindings", () => {
  it("counts files, not findings, and ignores dismissed-only files", () => {
    const files = [file("a.ts"), file("b.ts"), file("c.ts"), file("d.ts")];
    const findings = [
      finding("a.ts", 1),
      finding("a.ts", 2),
      finding("a.ts", 3),
      finding("b.ts", 1),
      finding("b.ts", 2),
      finding("c.ts", 1, "2026-01-02T00:00:00Z"),
    ];
    expect(countFilesWithFindings(files, findings)).toBe(2);
  });
});
