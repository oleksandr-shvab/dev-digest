import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OnboardingIndexReadiness, OnboardingTour } from "@devdigest/shared";
import { renderWithProviders } from "@/test/render";
import { TourHeader } from "./TourHeader";

const NOW = Date.parse("2026-11-03T12:00:00.000Z");

const makeTour = (over: Partial<OnboardingTour> = {}): OnboardingTour => ({
  repo_id: "r1",
  generated_at: "2026-11-03T10:00:00.000Z",
  commit_sha: "c0ffee",
  index_file_count: 12450,
  index_status: "full",
  architecture: { summary_md: "s", diagram: null, links: [] },
  critical_paths: { source: "critical_paths", items: [] },
  run_steps: [],
  reading_path: [],
  first_tasks: [],
  ...over,
});
const makeIndex = (over: Partial<OnboardingIndexReadiness> = {}): OnboardingIndexReadiness => ({
  ready: true,
  reason: null,
  status: "full",
  indexed_sha: "c0ffee",
  file_count: 12450,
  ...over,
});

function view(over: Partial<React.ComponentProps<typeof TourHeader>> = {}) {
  const onGenerate = vi.fn();
  const onShare = vi.fn();
  renderWithProviders(
    <TourHeader
      repoName="acme/payments-api"
      tour={makeTour()}
      index={makeIndex()}
      generating={false}
      lastError={null}
      onGenerate={onGenerate}
      onShare={onShare}
      now={NOW}
      {...over}
    />,
  );
  return { onGenerate, onShare };
}

describe("TourHeader", () => {
  it("shows the file count and age, and no notice for a fresh full-index tour", () => {
    view();

    expect(screen.getByText("Generated from index of 12,450 files · last refreshed 2h ago")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Share link" })).toBeEnabled();
    expect(screen.queryByText("Repo changed since this tour")).not.toBeInTheDocument();
    expect(screen.queryByText("Built from a partial index")).not.toBeInTheDocument();
    expect(screen.queryByText("Index this repository first")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("flags a stale tour only when the shas differ, and a partial index for partial tours", () => {
    view({ tour: makeTour({ index_status: "partial" }), index: makeIndex({ indexed_sha: "beef00" }) });

    expect(screen.getByText("Repo changed since this tour")).toBeInTheDocument();
    expect(screen.getByText("Built from a partial index")).toBeInTheDocument();
  });

  it("disables Regenerate while generating, and when the repo is not indexed", () => {
    view({ generating: true });
    expect(screen.getByText("Generating tour…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeDisabled();
  });

  it("explains a missing index and disables Regenerate", () => {
    view({ index: makeIndex({ ready: false, reason: "no_data", indexed_sha: null }) });
    expect(screen.getByText("Index this repository first")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeDisabled();
  });

  it("shows the failure reason and retries through Try again", async () => {
    const user = userEvent.setup();
    const { onGenerate } = view({ lastError: "timed out" });

    expect(screen.getByRole("alert")).toHaveTextContent("Generation failed: timed out");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("shows only the title when there is no tour", () => {
    view({ tour: null });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Onboarding for acme/payments-api");
    expect(screen.queryByText(/Generated from index/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Regenerate" })).not.toBeInTheDocument();
  });
});
