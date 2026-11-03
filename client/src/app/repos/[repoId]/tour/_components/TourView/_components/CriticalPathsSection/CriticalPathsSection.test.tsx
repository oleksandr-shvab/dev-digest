import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { CriticalPathsSection } from "./CriticalPathsSection";

const COMMIT = "c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00";
const view = (criticalPaths: Parameters<typeof CriticalPathsSection>[0]["criticalPaths"]) =>
  renderWithProviders(
    <CriticalPathsSection criticalPaths={criticalPaths} repoFullName="acme/payments-api" commitSha={COMMIT} />,
  );

describe("CriticalPathsSection", () => {
  it("shows path, note and a commit-pinned GitHub link that opens in a new tab", () => {
    view({
      source: "critical_paths",
      items: [
        { path: "src/server.ts", note: null },
        { path: "src/middleware/auth.ts", note: "Token validation, used by 14 routes" },
      ],
    });

    expect(screen.getByText("src/middleware/auth.ts")).toBeInTheDocument();
    expect(screen.getByText(/Token validation, used by 14 routes/)).toBeInTheDocument();
    expect(screen.queryByText("by file rank")).not.toBeInTheDocument();

    const open = screen.getByRole("link", { name: "Open src/middleware/auth.ts on GitHub" });
    expect(open).toHaveAttribute("href", `https://github.com/acme/payments-api/blob/${COMMIT}/src/middleware/auth.ts`);
    expect(open).toHaveAttribute("target", "_blank");
    expect(open).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("labels a file-rank fallback and renders a hostile path as literal text", () => {
    view({ source: "file_rank", items: [{ path: "<b>x</b>", note: "<i>n</i>" }] });

    expect(screen.getByText("by file rank")).toBeInTheDocument();
    expect(screen.getByText("<b>x</b>")).toBeInTheDocument();
    expect(screen.getByText(/<i>n<\/i>/)).toBeInTheDocument();
  });
});
