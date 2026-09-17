/**
 * FindingCounts — the PR list's FINDINGS cell. Covers the null/all-zero "—"
 * fallback, hiding zero-count severities, display order, and the
 * accessible label (icon + color + text, never color alone).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingCounts as FindingCountsShape } from "@/lib/types";
import messages from "../../../../../../../messages/en/prReview.json";
import { FindingCounts } from "./FindingCounts";

afterEach(cleanup);

function renderCounts(counts: FindingCountsShape | null | undefined) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <FindingCounts counts={counts} />
    </NextIntlClientProvider>,
  );
}

describe("FindingCounts", () => {
  it("shows — when there is no review yet (null)", () => {
    renderCounts(null);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows — when reviewed but every severity is zero, not three zero badges", () => {
    renderCounts({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("renders only the non-zero severities, in CRITICAL → WARNING → SUGGESTION order", () => {
    renderCounts({ CRITICAL: 1, WARNING: 0, SUGGESTION: 2 });
    const numbers = screen.getAllByText(/^[12]$/).map((el) => el.textContent);
    expect(numbers).toEqual(["1", "2"]);
  });

  it("sets an accessible label naming every non-zero severity", () => {
    renderCounts({ CRITICAL: 2, WARNING: 2, SUGGESTION: 2 });
    expect(screen.getByLabelText("2 critical · 2 warning · 2 suggestion")).toBeInTheDocument();
  });

  it("gives each item a title tooltip", () => {
    renderCounts({ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 });
    expect(screen.getByTitle("1 critical")).toBeInTheDocument();
  });
});
