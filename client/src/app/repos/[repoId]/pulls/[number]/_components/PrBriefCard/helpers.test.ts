import { describe, it, expect } from "vitest";
import type { FindingRecord, PrBriefState, ReviewRecord } from "@devdigest/shared";
import { bannerCounts, isInDiff, liveMessage, newestVerdictReview, shortSha, viewOf } from "./helpers";

const finding = (severity: FindingRecord["severity"], dismissed_at: string | null = null): FindingRecord => ({
  id: Math.random().toString(),
  severity,
  category: "perf",
  title: "t",
  file: "a.ts",
  start_line: 1,
  end_line: 1,
  rationale: "r",
  suggestion: null,
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r",
  accepted_at: null,
  dismissed_at,
});

const review = (id: string, created_at: string, over: Partial<ReviewRecord> = {}): ReviewRecord => ({
  id,
  pr_id: "p",
  agent_id: "a",
  run_id: null,
  kind: "review",
  verdict: "comment",
  summary: null,
  score: null,
  model: null,
  created_at,
  findings: [],
  ...over,
});

const state = (over: Partial<PrBriefState> = {}): PrBriefState => ({
  pr_id: "p",
  brief: null,
  head_sha: null,
  generated_at: null,
  stale: false,
  provider: null,
  model: null,
  tokens_in: null,
  tokens_out: null,
  cost_usd: null,
  unavailable_inputs: [],
  omitted_inputs: [],
  generating: false,
  last_error: null,
  ...over,
});
const withBrief = { brief: { summary: "s", risks: [], review_focus: [] } };

describe("newestVerdictReview / bannerCounts", () => {
  it("picks the newest review by created_at and skips verdict-less and summary reviews", () => {
    const reviews = [
      review("old", "2026-01-01T00:00:00Z"),
      review("newest-no-verdict", "2026-03-01T00:00:00Z", { verdict: null }),
      review("newer", "2026-02-01T00:00:00Z", { verdict: "approve" }),
      review("summary", "2026-04-01T00:00:00Z", { kind: "summary" }),
    ];
    expect(newestVerdictReview(reviews)?.id).toBe("newer");
    expect(newestVerdictReview([])).toBeNull();
    expect(newestVerdictReview([review("x", "2026-01-01T00:00:00Z", { verdict: null })])).toBeNull();
  });

  it("counts all findings but only undismissed CRITICAL ones as blockers", () => {
    const r = review("r", "2026-01-01T00:00:00Z", {
      findings: [finding("CRITICAL"), finding("CRITICAL", "2026-01-02T00:00:00Z"), finding("WARNING")],
    });
    expect(bannerCounts(r)).toEqual({ findings: 3, blockers: 1 });
  });
});

describe("viewOf", () => {
  it("covers every branch", () => {
    const base = { state: undefined, isLoading: false, isError: false, hasFiles: true };
    expect(viewOf({ ...base, isLoading: true })).toBe("loading");
    expect(viewOf({ ...base, isError: true })).toBe("error");
    // a failed refetch keeps showing the data we already have
    expect(viewOf({ ...base, isError: true, state: state(withBrief) })).toBe("ready");
    expect(viewOf({ ...base, state: state() })).toBe("empty");
    expect(viewOf({ ...base, state: state(), hasFiles: false })).toBe("noFiles");
    expect(viewOf({ ...base, state: state(withBrief) })).toBe("ready");
    expect(viewOf({ ...base, state: state({ generating: true }) })).toBe("empty");
  });
});

describe("small helpers", () => {
  it("shortSha, isInDiff", () => {
    expect(shortSha("a1b2c3d4e5f6")).toBe("a1b2c3d");
    expect(isInDiff(["a.ts"], "a.ts")).toBe(true);
    expect(isInDiff(["a.ts"], "b.ts")).toBe(false);
  });

  it("liveMessage reports generating, then failure, then ready", () => {
    expect(liveMessage(undefined)).toBeNull();
    expect(liveMessage(state())).toBeNull();
    expect(liveMessage(state({ generating: true, last_error: "x", ...withBrief }))?.key).toBe("generating");
    expect(liveMessage(state({ last_error: "timed out", ...withBrief }))).toEqual({
      key: "failed",
      values: { reason: "timed out" },
    });
    expect(liveMessage(state(withBrief))?.key).toBe("generated");
  });
});
