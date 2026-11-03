import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RunTrace } from "@devdigest/shared";
import { renderWithProviders } from "@/test/render";
import { TraceBody } from "./TraceBody";

const SPECS_BLOCK = '<untrusted source="specs/security-baseline.md">\nNever log secrets.\n</untrusted>';

const trace = (over: Partial<RunTrace> = {}): RunTrace => ({
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.06, findings: 2, grounding: "2/2 passed" },
  prompt_assembly: { system: "You are a reviewer.", skills: null, memory: null, specs: SPECS_BLOCK, user: "Review PR #482" },
  tool_calls: [],
  raw_output: "{}",
  memory_pulled: [],
  specs_read: ["specs/security-baseline.md"],
  log: [],
  project_context: {
    commit: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
    docs: [
      { path: "specs/security-baseline.md", tokens: 80, status: "included" },
      { path: "docs/data-retention.md", tokens: 700, status: "skipped_budget" },
      { path: "specs/removed-doc.md", tokens: 0, status: "missing" },
    ],
  },
  ...over,
});

describe("TraceBody — project context", () => {
  it("lists every collected doc with tokens and its status as text, and shows the exact specs text sent", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TraceBody trace={trace()} findings={[]} />);

    expect(screen.getByText("specs/security-baseline.md")).toBeInTheDocument();
    expect(screen.getByText("docs/data-retention.md")).toBeInTheDocument();
    expect(screen.getByText("≈ 700 tokens")).toBeInTheDocument();
    expect(screen.getByText("included")).toBeInTheDocument();
    expect(screen.getByText("skipped_budget")).toBeInTheDocument();
    expect(screen.getByText("missing")).toBeInTheDocument();
    expect(screen.getByText("commit a1b2c3d")).toBeInTheDocument();

    // The Prompt assembly section starts collapsed; open it, then the project context entry.
    await user.click(screen.getByText("Prompt assembly"));
    await user.click(screen.getByText("Project context — attached specs (untrusted)"));
    expect(
      screen.getByText((_, el) => el?.tagName === "PRE" && el.textContent === SPECS_BLOCK),
    ).toBeInTheDocument();
  });

  it("renders a path with markup characters as literal text", () => {
    const evil = '<b>"x"</b>.md';
    renderWithProviders(
      <TraceBody
        trace={trace({ project_context: { commit: null, docs: [{ path: evil, tokens: 1, status: "included" }] } })}
        findings={[]}
      />,
    );
    expect(screen.getByText(evil)).toBeInTheDocument();
    expect(document.querySelector("b")).toBeNull();
  });

  it("says 'Not used in CI runs' for a ci run, even when the trace carries a project context", () => {
    renderWithProviders(
      <TraceBody trace={trace({ config: { ...trace().config, source: "ci" } })} findings={[]} />,
    );
    expect(screen.getByText("Not used in CI runs")).toBeInTheDocument();
    expect(screen.queryByText("skipped_budget")).not.toBeInTheDocument();
  });

  it("falls back to the legacy specs_read list for a trace without project_context, and to 'none'", () => {
    const { unmount } = renderWithProviders(
      <TraceBody trace={trace({ project_context: undefined, specs_read: ["specs/public-api.md"] })} findings={[]} />,
    );
    expect(screen.getByText("specs/public-api.md")).toBeInTheDocument();
    expect(screen.queryByText(/tokens/)).not.toBeInTheDocument();
    unmount();

    renderWithProviders(<TraceBody trace={trace({ project_context: undefined, specs_read: [] })} findings={[]} />);
    expect(screen.getByText("none")).toBeInTheDocument();
  });
});
