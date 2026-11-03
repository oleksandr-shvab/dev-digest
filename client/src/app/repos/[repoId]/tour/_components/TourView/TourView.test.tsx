import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OnboardingTour, OnboardingTourState } from "@devdigest/shared";
import { renderWithProviders } from "@/test/render";
import { TourView } from "./TourView";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn(), postForm: vi.fn() } };
});
import { api } from "@/lib/api";

const COMMIT = "c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00";
const makeTour = (): OnboardingTour => ({
  repo_id: "r1",
  generated_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  commit_sha: COMMIT,
  index_file_count: 12450,
  index_status: "full",
  architecture: { summary_md: "Entry point is `src/server.ts`.", diagram: null, links: [] },
  critical_paths: { source: "critical_paths", items: [{ path: "src/server.ts", note: null }] },
  run_steps: [{ command: "pnpm install" }, { command: "pnpm dev # http://localhost:3000" }],
  reading_path: [{ path: "src/server.ts", reason: "See the whole request lifecycle in one file" }],
  first_tasks: [{ title: "Add a request-id header", description: "Set it in a hook.", paths: ["src/server.ts"] }],
});
const makeState = (over: Partial<OnboardingTourState> = {}): OnboardingTourState => ({
  repo_id: "r1",
  tour: makeTour(),
  generating: false,
  last_error: null,
  index: { ready: true, reason: null, status: "full", indexed_sha: COMMIT, file_count: 12450 },
  ...over,
});

function view(state: OnboardingTourState) {
  vi.mocked(api.get).mockResolvedValue(state);
  return renderWithProviders(<TourView repoId="r1" repoFullName="acme/payments-api" repoName="payments-api" />);
}

beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
});

describe("TourView", () => {
  it("shows the empty state for a repo without a tour, and Generate Tour starts the generation", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue(makeState({ tour: null, generating: true }));
    view(makeState({ tour: null }));

    expect(await screen.findByText(/A tour of this repo in five parts/)).toBeInTheDocument();
    const generate = screen.getByRole("button", { name: "Generate tour" });
    expect(generate).toBeEnabled();

    await user.click(generate);
    expect(api.post).toHaveBeenCalledWith("/repos/r1/onboarding/generate");
    await waitFor(() => expect(screen.getByRole("button", { name: "Generate tour" })).toBeDisabled());
    expect(screen.getByRole("status", { name: "Tour status" })).toHaveTextContent("Generating tour…");
  });

  it("renders the five sections in order, and moves focus to a section heading from On this page", async () => {
    const user = userEvent.setup();
    view(makeState());

    await screen.findByRole("heading", { level: 2, name: "Architecture overview" });
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Architecture overview",
      "Critical paths",
      "How to run locally",
      "Guided reading path",
      "First tasks",
    ]);

    const nav = screen.getByRole("navigation", { name: "On this page" });
    await user.click(within(nav).getByRole("button", { name: "First tasks" }));
    expect(screen.getByRole("heading", { level: 2, name: "First tasks" })).toHaveFocus();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("copies a command and the page address, and announces both", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/repos/r1/tour");
    view(makeState());

    await user.click(await screen.findByRole("button", { name: "Copy command 1" }));
    expect(await navigator.clipboard.readText()).toBe("pnpm install");
    await waitFor(() => expect(screen.getByRole("status", { name: "Tour status" })).toHaveTextContent("Copied"));

    await user.click(screen.getByRole("button", { name: "Share link" }));
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/repos/r1/tour`);
    await waitFor(() => expect(screen.getByRole("status", { name: "Tour status" })).toHaveTextContent("Link copied"));
  });

  it("falls back to a focused, read-only field when the clipboard write is rejected", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    view(makeState());

    await user.click(await screen.findByRole("button", { name: "Copy command 2" }));
    const field = await screen.findByRole("textbox", { name: "Copy this text manually" });
    expect(field).toHaveValue("pnpm dev # http://localhost:3000");
    expect(field).toHaveAttribute("readonly");
    expect(field).toHaveFocus();
  });

  it("keeps the tour visible while generating, with Regenerate disabled", async () => {
    view(makeState({ generating: true }));

    expect(await screen.findByRole("heading", { level: 2, name: "Critical paths" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Tour status" })).toHaveTextContent("Generating tour…");
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeDisabled();
  });

  it("keeps the old tour after a failed regeneration and offers Try again", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue(makeState({ generating: true }));
    view(makeState({ last_error: "provider error: boom" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Generation failed: provider error: boom");
    expect(screen.getByRole("heading", { level: 2, name: "Architecture overview" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(api.post).toHaveBeenCalledWith("/repos/r1/onboarding/generate");
  });

  it("shows the stored tour with Regenerate disabled when the repo is not indexed", async () => {
    view(makeState({ index: { ready: false, reason: "no_data", status: null, indexed_sha: null, file_count: 0 } }));

    expect(await screen.findByText("Index this repository first")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Critical paths" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeDisabled();
  });
});
