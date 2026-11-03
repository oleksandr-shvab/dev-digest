import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, screen } from "@testing-library/react";
import type { OnboardingTour } from "@devdigest/shared";
import { renderWithProviders } from "@/test/render";
import { ArchitectureSection } from "./ArchitectureSection";

const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  parse: vi.fn(),
  render: vi.fn(),
}));
vi.mock("mermaid", () => ({ default: mermaid }));

const architecture = (over: Partial<OnboardingTour["architecture"]> = {}): OnboardingTour["architecture"] => ({
  summary_md: "The entry point is `src/server.ts`.",
  diagram: 'flowchart LR\n  A["client"] --> B["server.ts"]',
  links: [],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mermaid.parse.mockResolvedValue(true);
  mermaid.render.mockResolvedValue({ svg: '<svg role="img" aria-label="architecture diagram"></svg>' });
});

describe("ArchitectureSection", () => {
  it("renders the summary and then the diagram, with links as plain-text chips", async () => {
    renderWithProviders(
      <ArchitectureSection architecture={architecture({ links: [{ label: "Server", path: "src/server.ts" }] })} />,
    );

    const summary = screen.getByText("src/server.ts", { selector: "code" });
    const diagram = await screen.findByRole("img", { name: "architecture diagram" });
    expect(summary.compareDocumentPosition(diagram) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Server")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("keeps the summary and shows no diagram and no syntax error when the diagram does not parse", async () => {
    mermaid.parse.mockResolvedValue(false);
    renderWithProviders(<ArchitectureSection architecture={architecture()} />);
    // Let MermaidDiagram's async validate-then-render effect settle.
    await act(async () => {});

    expect(screen.getByText("src/server.ts", { selector: "code" })).toBeInTheDocument();
    expect(mermaid.parse).toHaveBeenCalled();
    expect(mermaid.render).not.toHaveBeenCalled();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText(/syntax error/i)).not.toBeInTheDocument();
  });

  it("renders no diagram when it is null", () => {
    renderWithProviders(<ArchitectureSection architecture={architecture({ diagram: null })} />);
    expect(mermaid.parse).not.toHaveBeenCalled();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("neutralises raw HTML and javascript: links in the summary", () => {
    const { container } = renderWithProviders(
      <ArchitectureSection
        architecture={architecture({
          diagram: null,
          summary_md: "<script>alert(1)</script>\n\n[x](javascript:alert(1))",
        })}
      />,
    );

    expect(container.querySelector("script")).toBeNull();
    for (const a of container.querySelectorAll("a")) {
      expect(a.getAttribute("href") ?? "").not.toMatch(/javascript:/i);
    }
  });
});
