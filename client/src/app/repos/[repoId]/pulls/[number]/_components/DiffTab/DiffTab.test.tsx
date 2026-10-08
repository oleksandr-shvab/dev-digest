import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiff } from "@devdigest/shared";
import shell from "../../../../../../../../messages/en/shell.json";
import prReview from "../../../../../../../../messages/en/prReview.json";

const h = vi.hoisted(() => ({
  reviews: [] as ReviewRecord[],
  mutate: vi.fn(),
}));

// Mock at the @/lib boundary (precedent: FindingsPanel.test.tsx), not at the network.
vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ isPending: false, mutateAsync: vi.fn() }),
  usePrReviews: () => ({ data: h.reviews }),
  useSmartDiff: () => ({ data: SMART_DIFF }),
  useFindingAction: () => ({ mutate: h.mutate, isPending: false }),
}));

import { DiffTab } from "./DiffTab";

afterEach(cleanup);
beforeEach(() => h.mutate.mockClear());

const f = (path: string, patch?: string): PrFile => ({ path, additions: 1, deletions: 0, patch });

// GitHub order, deliberately not the smart order.
const FILES: PrFile[] = [
  f("README.md"),
  f("src/z.ts", "@@ -1,2 +1,3 @@\n a\n b\n+c"),
  f("pnpm-lock.yaml"),
  f("src/a.ts"),
  f("src/a.test.ts"),
];

const sf = (path: string) => ({ path, additions: 1, deletions: 0, finding_lines: [] });
const SMART_DIFF: SmartDiff = {
  groups: [
    { role: "core", files: [sf("src/z.ts"), sf("src/a.ts")] },
    { role: "tests", files: [sf("src/a.test.ts")] },
    { role: "wiring", files: [] },
    { role: "docs", files: [sf("README.md")] },
    { role: "boilerplate", files: [sf("pnpm-lock.yaml")] },
  ],
  split_suggestion: { too_big: false, total_lines: 5, proposed_splits: [] },
};

function finding(id: string, title: string, file: string, start_line: number): FindingRecord {
  return {
    id,
    severity: "WARNING",
    category: "perf",
    title,
    file,
    start_line,
    end_line: start_line,
    rationale: "because",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r",
    accepted_at: null,
    dismissed_at: null,
  };
}

function review(id: string, created_at: string, findings: FindingRecord[]): ReviewRecord {
  return {
    id,
    pr_id: "pr-1",
    agent_id: "agent-1",
    run_id: null,
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    created_at,
    findings,
  };
}

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell, prReview }}>
      <DiffTab prId="pr-1" filesCount={FILES.length} files={FILES} canComment />
    </NextIntlClientProvider>,
  );
}

const HEADERS = /^(Core|Tests|Wiring|Docs|Boilerplate)$/;

describe("DiffTab (Smart Diff)", () => {
  it("groups files by role, counts files with findings, shows only the latest review and wires Accept", async () => {
    // Newest first, same agent: only the newer review's findings count.
    h.reviews = [
      review("r-new", "2026-02-02T00:00:00Z", [finding("f-new", "New finding", "src/z.ts", 3)]),
      review("r-old", "2026-01-01T00:00:00Z", [finding("f-old", "Old finding", "src/a.ts", 1)]),
    ];
    const user = userEvent.setup();
    renderTab();

    expect(screen.getAllByText(HEADERS).map((el) => el.textContent)).toEqual([
      "Core",
      "Tests",
      "Wiring",
      "Docs",
      "Boilerplate",
    ]);
    expect(screen.getByText("2 files")).toBeInTheDocument();
    expect(screen.getAllByText("1 files")).toHaveLength(3);
    expect(screen.getByText("0 files")).toBeInTheDocument();

    // Docs and Boilerplate start collapsed.
    expect(screen.queryByText("pnpm-lock.yaml")).not.toBeInTheDocument();
    expect(screen.queryByText("README.md")).not.toBeInTheDocument();
    await user.click(screen.getByText("Boilerplate"));
    expect(screen.getByText("pnpm-lock.yaml")).toBeInTheDocument();
    await user.click(screen.getByText("Docs"));
    expect(screen.getByText("README.md")).toBeInTheDocument();

    // Counter is in files, and only the latest review's finding is rendered.
    expect(screen.getByLabelText("1 files with findings")).toBeInTheDocument();
    expect(screen.getByText("New finding")).toBeInTheDocument();
    expect(screen.queryByText("Old finding")).not.toBeInTheDocument();

    await user.click(screen.getByText("Accept"));
    expect(h.mutate).toHaveBeenCalledWith({ findingId: "f-new", action: "accept", prId: "pr-1" });
  });

  it("Original order lists the files in GitHub order, without group headers", async () => {
    h.reviews = [review("r1", "2026-02-02T00:00:00Z", [])];
    const user = userEvent.setup();
    renderTab();

    await user.click(screen.getByRole("button", { name: "Original order" }));

    expect(screen.queryAllByText(HEADERS)).toHaveLength(0);
    const shown = screen
      .getAllByText(/^(README\.md|src\/z\.ts|pnpm-lock\.yaml|src\/a\.ts|src\/a\.test\.ts)$/)
      .map((el) => el.textContent);
    expect(shown).toEqual(FILES.map((x) => x.path));
  });

  it("before the first review: says so, shows no findings counter, still groups", () => {
    h.reviews = [];
    renderTab();

    expect(screen.getByText("Review not run yet")).toBeInTheDocument();
    expect(screen.queryByLabelText(/files with findings/)).not.toBeInTheDocument();
    expect(screen.getAllByText(HEADERS)).toHaveLength(5);
  });
});
