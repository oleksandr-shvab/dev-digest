import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import shell from "../../../../messages/en/shell.json";
import prReview from "../../../../messages/en/prReview.json";
import type { DiffFindingApi } from "../findings";
import { FileCard } from "./FileCard";

afterEach(cleanup);

// New line 45 is the added line; 999 is nowhere in this patch.
const FILE: PrFile = {
  path: "src/api/users.ts",
  additions: 1,
  deletions: 0,
  patch: "@@ -43,3 +43,4 @@\n const a = 1;\n const b = 2;\n+const c = loadUsers();\n const d = 4;",
};

function finding(over: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f",
    severity: "WARNING",
    category: "perf",
    title: "t",
    file: FILE.path,
    start_line: 45,
    end_line: 45,
    rationale: "because",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

const FINDINGS = [
  finding({ id: "f-warn", severity: "WARNING", title: "N+1 query in loop", start_line: 45 }),
  finding({ id: "f-crit", severity: "CRITICAL", title: "Secret outside the patch", start_line: 999 }),
];

function renderCard(file: PrFile, findingApi: DiffFindingApi) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell, prReview }}>
      <FileCard file={file} findingApi={findingApi} />
    </NextIntlClientProvider>,
  );
}

describe("FileCard with review findings", () => {
  it("shows the dot, the line label, the inline card and the outside-the-diff block, and wires Accept", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    renderCard(FILE, { findings: FINDINGS, showFindings: true, pending: false, onAction });

    expect(screen.getByRole("img", { name: "Has review findings" })).toBeInTheDocument();
    expect(screen.getByText("N+1 query in loop")).toBeInTheDocument();
    expect(screen.getByText("warning")).toBeInTheDocument();
    expect(screen.getByText("1 finding(s) outside the diff")).toBeInTheDocument();
    expect(screen.getByText("Secret outside the patch")).toBeInTheDocument();

    // The inline card under line 45 comes before the outside-the-diff block.
    await user.click(screen.getAllByText("Accept")[0]!);
    expect(onAction).toHaveBeenCalledWith("f-warn", "accept");
  });

  it("hides only the cards when showFindings is false; a file without findings has no dot", () => {
    renderCard(FILE, { findings: FINDINGS, showFindings: false, pending: false, onAction: vi.fn() });

    expect(screen.queryByText("N+1 query in loop")).not.toBeInTheDocument();
    expect(screen.queryByText("Secret outside the patch")).not.toBeInTheDocument();
    expect(screen.queryByText(/outside the diff/)).not.toBeInTheDocument();
    expect(screen.getByText("warning")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Has review findings" })).toBeInTheDocument();

    cleanup();
    renderCard(FILE, {
      findings: [finding({ id: "other", file: "src/other.ts" })],
      showFindings: true,
      pending: false,
      onAction: vi.fn(),
    });
    expect(screen.queryByRole("img", { name: "Has review findings" })).not.toBeInTheDocument();
  });
});
