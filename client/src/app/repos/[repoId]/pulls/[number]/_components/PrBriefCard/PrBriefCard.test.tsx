import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FindingRecord, PrBrief, PrBriefState, ReviewRecord } from "@devdigest/shared";
import { ToastProvider } from "@/lib/toast";
import brief from "../../../../../../../../messages/en/brief.json";
import prReview from "../../../../../../../../messages/en/prReview.json";

const h = vi.hoisted(() => ({
  state: undefined as PrBriefState | undefined,
  isLoading: false,
  isError: false,
  isPending: false,
  reviews: [] as ReviewRecord[],
  mutate: vi.fn(),
}));

// Mock at the @/lib/hooks boundary (precedent: DiffTab.test.tsx), not at the network.
vi.mock("@/lib/hooks/brief", () => ({
  usePrBrief: () => ({ data: h.state, isLoading: h.isLoading, isError: h.isError }),
  useGeneratePrBrief: () => ({ mutate: h.mutate, isPending: h.isPending }),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: h.reviews }),
}));

import { PrBriefCard } from "./PrBriefCard";

afterEach(cleanup);
beforeEach(() => {
  h.state = undefined;
  h.isLoading = false;
  h.isError = false;
  h.isPending = false;
  h.reviews = [];
  h.mutate.mockClear();
});

const NOW = Date.now();
const DIFF_PATHS = ["src/config.ts", "src/middleware/ratelimit.ts", "src/api/users.ts"];

const BRIEF: PrBrief = {
  summary: "Adds a token-bucket rate limiter to the public API.",
  risks: [
    {
      kind: "security",
      title: "Secret set in plaintext in config",
      explanation: "The key is read from a literal.",
      severity: "high",
      file_refs: ["src/config.ts"],
    },
    {
      kind: "perf",
      title: "Limiter runs on every request",
      explanation: "Adds latency to all routes.",
      severity: "medium",
      file_refs: ["src/middleware/ratelimit.ts", "src/gone.ts"],
    },
  ],
  review_focus: [
    { file: "src/config.ts", line: 12, reason: "Secret key set in plaintext" },
    { file: "src/middleware/ratelimit.ts", line: null, reason: "Check the bucket refill" },
  ],
};

const state = (over: Partial<PrBriefState> = {}): PrBriefState => ({
  pr_id: "pr-1",
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

const ready = (over: Partial<PrBriefState> = {}): PrBriefState =>
  state({
    brief: BRIEF,
    head_sha: "a1b2c3d4e5f6",
    generated_at: new Date(NOW - 5 * 60_000).toISOString(),
    provider: "openai",
    model: "gpt-4.1",
    tokens_in: 8200,
    tokens_out: 1300,
    cost_usd: 0.014,
    ...over,
  });

function finding(severity: FindingRecord["severity"], dismissed_at: string | null = null): FindingRecord {
  return {
    id: `f-${severity}-${dismissed_at ?? "open"}`,
    severity,
    category: "security",
    title: "t",
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
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

const REVIEW: ReviewRecord = {
  id: "r1",
  pr_id: "pr-1",
  agent_id: "a1",
  run_id: null,
  kind: "review",
  verdict: "request_changes",
  summary: "Do not show me",
  score: 61,
  model: null,
  created_at: "2026-11-09T10:00:00Z",
  findings: [finding("CRITICAL"), finding("CRITICAL", "2026-11-09T11:00:00Z"), finding("WARNING")],
};

function ui(diffPaths: string[] = DIFF_PATHS, onOpenFile = vi.fn()) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={{ brief, prReview }}>
        <ToastProvider>
          <PrBriefCard prId="pr-1" diffPaths={diffPaths} onOpenFile={onOpenFile} />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}
const renderCard = (diffPaths?: string[], onOpenFile = vi.fn()) => {
  const view = render(ui(diffPaths, onOpenFile));
  return { ...view, onOpenFile, again: () => view.rerender(ui(diffPaths, onOpenFile)) };
};
const statusRegion = () => screen.getByRole("status", { name: "PR brief status" });

describe("PrBriefCard", () => {
  it("offers Generate when there is no brief, and shows the busy state when generating", async () => {
    const user = userEvent.setup();
    h.state = state();
    const { again } = renderCard();

    const generate = screen.getByRole("button", { name: "Generate brief" });
    expect(generate).toBeEnabled();
    await user.click(generate);
    expect(h.mutate).toHaveBeenCalledTimes(1);

    h.state = state({ generating: true });
    again();
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeDisabled();
    expect(document.querySelector(".skeleton")).not.toBeNull();
    expect(statusRegion()).toHaveTextContent("Generating brief…");
  });

  it("shows the banner above the summary, risks with text severity, focus items, meta, and unknown cost", async () => {
    const user = userEvent.setup();
    h.state = ready();
    h.reviews = [REVIEW];
    const { again } = renderCard();

    const banner = screen.getByText("Request changes");
    const summary = screen.getByText(BRIEF.summary);
    expect(banner.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("PR SCORE")).toBeInTheDocument();
    expect(screen.getByText(/3 findings · 1 blockers/)).toBeInTheDocument();
    // the review's own summary is not repeated inside the brief
    expect(screen.queryByText("Do not show me")).not.toBeInTheDocument();

    expect(screen.getByText("Risk areas")).toBeInTheDocument();
    expect(screen.getByText("High risk")).toBeInTheDocument();
    expect(screen.getByText("Medium risk")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open src/config.ts in Files changed" })).toBeInTheDocument();

    // explanation is collapsed until the row is expanded
    expect(screen.queryByText("The key is read from a literal.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show explanation for Secret set in plaintext in config" }));
    expect(screen.getByText("The key is read from a literal.")).toBeInTheDocument();

    const items = within(screen.getByRole("list", { name: "Review focus — read these first" })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("src/config.ts:12 — Secret key set in plaintext");
    expect(items[1]).toHaveTextContent("src/middleware/ratelimit.ts — Check the bucket refill");
    expect(items[1]).not.toHaveTextContent("ratelimit.ts:");

    expect(screen.getByText("8,200 → 1,300 tokens")).toBeInTheDocument();
    expect(screen.getByText("$0.014")).toBeInTheDocument();
    expect(screen.getByText("Generated for a1b2c3d · 5m ago")).toBeInTheDocument();
    expect(statusRegion()).toHaveTextContent("Brief ready.");

    h.state = ready({ cost_usd: null });
    again();
    expect(screen.getByText("cost unknown")).toBeInTheDocument();
  });

  it("opens an in-diff file and line, and refuses a file outside the diff", async () => {
    const user = userEvent.setup();
    h.state = ready();
    const { onOpenFile } = renderCard();

    await user.click(screen.getByRole("button", { name: "Open src/config.ts line 12 in Files changed" }));
    expect(onOpenFile).toHaveBeenCalledWith("src/config.ts", 12);
    expect(screen.queryByText("File not in this PR's diff")).not.toBeInTheDocument();

    onOpenFile.mockClear();
    await user.click(screen.getByRole("button", { name: "Open src/gone.ts in Files changed" }));
    expect(onOpenFile).not.toHaveBeenCalled();
    expect(screen.getByText("File not in this PR's diff")).toBeInTheDocument();
  });

  it("keeps the stored brief on a failed regeneration and offers Try again and refresh", async () => {
    const user = userEvent.setup();
    h.state = ready({ last_error: "timed out" });
    renderCard();

    expect(screen.getByRole("alert")).toHaveTextContent("Brief generation failed: timed out");
    expect(screen.getByText(BRIEF.summary)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(h.mutate).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Regenerate brief" }));
    expect(h.mutate).toHaveBeenCalledTimes(2);
    expect(statusRegion()).toHaveTextContent("Brief generation failed: timed out");
  });

  it("disables refresh and swaps the content for a skeleton while a regeneration runs", () => {
    h.state = ready({ generating: true });
    renderCard();

    const refresh = screen.getByRole("button", { name: "Regenerate brief" });
    expect(refresh).toBeDisabled();
    expect(refresh).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText(BRIEF.summary)).not.toBeInTheDocument();
  });

  it("shows the stale notice and what the brief was generated without or left out", () => {
    h.state = ready({
      stale: true,
      unavailable_inputs: [
        { kind: "intent", ref: null },
        { kind: "linked_issue", ref: "#999" },
      ],
      omitted_inputs: [{ kind: "caller_files", ref: null, kept: 40, total: 60 }],
    });
    renderCard();

    expect(screen.getByText("The PR has new commits since this brief was generated.")).toBeInTheDocument();
    expect(screen.getByText("Generated without")).toBeInTheDocument();
    expect(screen.getByText(/Intent · Linked issue #999/)).toBeInTheDocument();
    expect(screen.getByText("Left out to fit the input budget")).toBeInTheDocument();
    expect(screen.getByText(/40 of 60 caller files/)).toBeInTheDocument();
  });

  it("renders model text as literal text, never as markup", () => {
    h.state = ready({ brief: { ...BRIEF, summary: "<script>alert(1)</script>" } });
    const { container } = renderCard();

    expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
  });

  it("says there are no changed files and offers no Generate button", () => {
    h.state = state();
    renderCard([]);

    expect(screen.getByText("There are no changed files to brief.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate brief" })).not.toBeInTheDocument();
  });

  it("caps the risks at 6 and the focus items at 5", () => {
    const risks = Array.from({ length: 8 }, (_, i) => ({
      kind: "k",
      title: `Risk ${i + 1}`,
      explanation: "e",
      severity: "low" as const,
      file_refs: ["src/config.ts"],
    }));
    const review_focus = Array.from({ length: 7 }, (_, i) => ({ file: "src/config.ts", line: i + 1, reason: `why ${i + 1}` }));
    h.state = ready({ brief: { summary: "s", risks, review_focus } });
    renderCard();

    expect(screen.getAllByText(/^Risk \d$/)).toHaveLength(6);
    expect(screen.getByText("Risk 6")).toBeInTheDocument();
    expect(screen.queryByText("Risk 7")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Open src\/config\.ts line \d in Files changed$/ })).toHaveLength(5);
  });
});

// ---- Gap-filling flows (audit of specs/03-pr-brief.md against the flows above) ----
describe("PrBriefCard unhappy paths and states", () => {
  it("after a failed first generation shows the reason with Try again, keeps Generate, and offers no refresh (AC-12)", async () => {
    const user = userEvent.setup();
    h.state = state({ last_error: "OPENAI_API_KEY is not configured" });
    renderCard();

    expect(screen.getByRole("alert")).toHaveTextContent("Brief generation failed: OPENAI_API_KEY is not configured");
    expect(statusRegion()).toHaveTextContent("Brief generation failed: OPENAI_API_KEY is not configured");
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Regenerate brief" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(h.mutate).toHaveBeenCalledTimes(1);
  });

  it("shows a skeleton and no Generate button while loading, and a load error when the read fails", () => {
    h.isLoading = true;
    const loading = renderCard();
    expect(document.querySelector(".skeleton")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Generate brief" })).not.toBeInTheDocument();
    loading.unmount();

    h.isLoading = false;
    h.isError = true;
    renderCard();
    expect(screen.getByText("Could not load the brief.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate brief" })).not.toBeInTheDocument();
  });

  it("is busy as soon as the POST is in flight, before the server reports generating (AC-22)", () => {
    h.isPending = true;
    h.state = state();
    const empty = renderCard();
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeDisabled();
    expect(document.querySelector(".skeleton")).not.toBeNull();
    empty.unmount();

    // With a stored brief: refresh is busy, and an old failure is not shown next to the new run.
    h.state = ready({ last_error: "timed out" });
    renderCard();
    const refresh = screen.getByRole("button", { name: "Regenerate brief" });
    expect(refresh).toBeDisabled();
    expect(refresh).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("opens a risk's file in Files changed without a line, and clears an earlier not-in-diff message (AC-34, AC-35)", async () => {
    const user = userEvent.setup();
    h.state = ready({
      brief: {
        ...BRIEF,
        review_focus: [
          { file: "src/gone.ts", line: 4, reason: "Removed by a later commit" },
          { file: "src/config.ts", line: 12, reason: "Secret key set in plaintext" },
        ],
      },
    });
    const { onOpenFile } = renderCard();

    // A focus item whose file is not in the diff: message, no navigation.
    await user.click(screen.getByRole("button", { name: "Open src/gone.ts line 4 in Files changed" }));
    expect(onOpenFile).not.toHaveBeenCalled();
    expect(screen.getByText("File not in this PR's diff")).toBeInTheDocument();

    // A risk's file that is in the diff: opens it with no line, and the message goes away.
    const riskFile = screen
      .getAllByRole("button", { name: "Open src/config.ts in Files changed" })
      .find((b) => b.className.includes("mono"))!;
    await user.click(riskFile);
    expect(onOpenFile).toHaveBeenCalledTimes(1);
    expect(onOpenFile).toHaveBeenCalledWith("src/config.ts", null);
    expect(screen.queryByText("File not in this PR's diff")).not.toBeInTheDocument();
  });

  it("shows no verdict banner when the PR was never reviewed or its newest review has no verdict (AC-32)", () => {
    h.state = ready();
    h.reviews = [];
    const never = renderCard();
    expect(screen.getByText(BRIEF.summary)).toBeInTheDocument();
    expect(screen.queryByText("PR SCORE")).not.toBeInTheDocument();
    expect(screen.queryByText("Request changes")).not.toBeInTheDocument();
    never.unmount();

    h.reviews = [{ ...REVIEW, verdict: null }];
    renderCard();
    expect(screen.queryByText("PR SCORE")).not.toBeInTheDocument();
    expect(screen.queryByText("Request changes")).not.toBeInTheDocument();
  });

  it("renders risk titles, explanations and focus reasons as literal text, never as markup (AC-27)", async () => {
    const user = userEvent.setup();
    const payload = "<img src=x onerror=alert(1)>";
    h.state = ready({
      brief: {
        summary: "s",
        risks: [{ kind: "k", title: `T ${payload}`, explanation: `E ${payload}`, severity: "low", file_refs: ["src/config.ts"] }],
        review_focus: [{ file: "src/config.ts", line: null, reason: `R ${payload}` }],
      },
    });
    const { container } = renderCard();

    await user.click(screen.getByRole("button", { name: `Show explanation for T ${payload}` }));
    expect(screen.getByText(`T ${payload}`)).toBeInTheDocument();
    expect(screen.getByText(`E ${payload}`)).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Review focus — read these first" })).toHaveTextContent(`R ${payload}`);
    expect(container.querySelector("img")).toBeNull();
    // the low severity gets a text label too, not only colour (AC-31)
    expect(screen.getByText("Low risk")).toBeInTheDocument();
  });

  it("names every kind of unavailable and left-out input from the catalogue (AC-6, AC-15, AC-21)", () => {
    h.state = ready({
      unavailable_inputs: [
        { kind: "intent", ref: null },
        { kind: "blast_radius", ref: null },
        { kind: "linked_issue", ref: "o/r#9" },
        { kind: "specs", ref: "docs/gone.md" },
      ],
      omitted_inputs: [
        { kind: "spec", ref: "docs/a.md", kept: null, total: null },
        { kind: "issue_text", ref: "o/r#1", kept: null, total: null },
        { kind: "pr_description", ref: null, kept: null, total: null },
        { kind: "caller_files", ref: null, kept: 40, total: 60 },
        { kind: "findings", ref: null, kept: 3, total: 9 },
        { kind: "file_stats", ref: null, kept: 2, total: 30 },
      ],
    });
    renderCard();

    expect(screen.getByText("Intent · Blast radius · Linked issue o/r#9 · Attached specs docs/gone.md")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Spec docs/a.md · Issue text (o/r#1) · PR description · 40 of 60 caller files · 3 of 9 findings · 2 of 30 file statistics",
      ),
    ).toBeInTheDocument();
    // a kind without a catalogue entry would leave its message key on screen
    expect(document.body.textContent).not.toMatch(/prBrief\./);
  });

  it("shows how long ago the brief was generated in minutes, hours, days and just now (AC-38)", () => {
    const ago = (ms: number) => ready({ generated_at: new Date(Date.now() - ms).toISOString() });
    h.state = ago(10_000);
    const { again } = renderCard();
    expect(screen.getByText("Generated for a1b2c3d · just now")).toBeInTheDocument();

    h.state = ago(3 * 3_600_000 + 5_000);
    again();
    expect(screen.getByText("Generated for a1b2c3d · 3h ago")).toBeInTheDocument();

    h.state = ago(2 * 86_400_000 + 5_000);
    again();
    expect(screen.getByText("Generated for a1b2c3d · 2d ago")).toBeInTheDocument();
  });

  it("keeps showing a stale brief with its refresh button enabled (AC-19)", async () => {
    const user = userEvent.setup();
    h.state = ready({ stale: true });
    renderCard();

    expect(screen.getByText(BRIEF.summary)).toBeInTheDocument();
    const refresh = screen.getByRole("button", { name: "Regenerate brief" });
    expect(refresh).toBeEnabled();
    await user.click(refresh);
    expect(h.mutate).toHaveBeenCalledTimes(1);
  });
});

