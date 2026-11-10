import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import shell from "../../../../messages/en/shell.json";
import prReview from "../../../../messages/en/prReview.json";
import type { DiffFindingApi } from "../findings";
import type { DiffFocus } from "../helpers";
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

// 300 added lines: over AUTO_EXPAND_MAX_LINES, so the card starts collapsed.
const BIG_FILE: PrFile = {
  path: "src/big.ts",
  additions: 300,
  deletions: 0,
  patch: ["@@ -0,0 +1,300 @@", ...Array.from({ length: 300 }, (_, i) => `+row ${i + 1}`)].join("\n"),
};

function renderFocused(focus: DiffFocus | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell, prReview }}>
      <FileCard file={BIG_FILE} focus={focus} />
    </NextIntlClientProvider>,
  );
}

describe("FileCard focus", () => {
  it("opens a collapsed file on the focused line, scrolls to it, and still collapses on click", async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    renderFocused(null);
    expect(screen.getByRole("button", { expanded: false })).toBeInTheDocument();
    cleanup();

    renderFocused({ path: BIG_FILE.path, line: 3 });
    const header = screen.getByRole("button", { expanded: true });
    // the nearest aria-current ancestor of row 3 is its own row; row 4 only has the card itself
    const row3 = screen.getByText("row 3").closest('[aria-current="location"]')!;
    expect(row3).toHaveTextContent("row 3");
    expect(row3).not.toHaveTextContent("row 4");
    expect(screen.getByText("row 4").closest('[aria-current="location"]')).not.toBe(row3);
    expect(scrollIntoView).toHaveBeenCalled();

    await user.click(header);
    expect(screen.getByRole("button", { expanded: false })).toBeInTheDocument();
    expect(screen.queryByText("row 3")).not.toBeInTheDocument();
  });
});

describe("FileCard focus: once per target", () => {
  const ui = (focus: DiffFocus | null) => (
    <NextIntlClientProvider locale="en" messages={{ shell, prReview }}>
      <FileCard file={BIG_FILE} focus={focus} />
    </NextIntlClientProvider>
  );

  it("does not reopen a card the user collapsed while the same target stays, and reopens it for a new line", async () => {
    const user = userEvent.setup();
    Element.prototype.scrollIntoView = vi.fn();
    const view = render(ui({ path: BIG_FILE.path, line: 3 }));

    await user.click(screen.getByRole("button", { expanded: true }));
    expect(screen.getByRole("button", { expanded: false })).toBeInTheDocument();

    view.rerender(ui({ path: BIG_FILE.path, line: 3 }));
    expect(screen.getByRole("button", { expanded: false })).toBeInTheDocument();
    expect(screen.queryByText("row 3")).not.toBeInTheDocument();

    view.rerender(ui({ path: BIG_FILE.path, line: 7 }));
    expect(screen.getByRole("button", { expanded: true })).toBeInTheDocument();
    expect(screen.getByText("row 7").closest('[aria-current="location"]')).toHaveTextContent("row 7");
  });

  it("outlines and scrolls to the card when the focused line is not in the patch (AC-8)", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { container } = render(ui({ path: BIG_FILE.path, line: 999 }));

    expect(screen.getByRole("button", { expanded: true })).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    // only the card itself is marked: no row carries the target
    expect(container.querySelectorAll('[aria-current="location"]')).toHaveLength(1);
  });

  it("leaves a card for another file closed and unmarked", () => {
    Element.prototype.scrollIntoView = vi.fn();
    const { container } = render(ui({ path: "src/other.ts", line: 3 }));

    expect(screen.getByRole("button", { expanded: false })).toBeInTheDocument();
    expect(container.querySelector('[aria-current="location"]')).toBeNull();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});

