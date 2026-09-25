import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import type { SkillStats } from "@devdigest/shared";
import { renderWithProviders } from "@/test/render";
import { StatsTab } from "./StatsTab";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), postForm: vi.fn() } };
});
import { api } from "@/lib/api";

const STATS: SkillStats = {
  window_days: 30,
  used_by: 2,
  pull_rate: null,
  accept_rate: null,
  findings: 0,
  agents: [
    { id: "ag1", name: "Test Quality Reviewer", enabled: true },
    { id: "ag2", name: "Security Reviewer", enabled: false },
  ],
  by_category: [],
};

beforeEach(() => vi.clearAllMocks());

describe("skill StatsTab", () => {
  it("renders a dash with a hint for null metrics and links agents to their Skills tab", async () => {
    vi.mocked(api.get).mockResolvedValue(STATS);
    renderWithProviders(<StatsTab skillId="s1" />);

    expect(await screen.findByText("Last 30 days · runs this skill was part of")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/skills/s1/stats");
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.getByText("No runs yet")).toBeInTheDocument();
    expect(screen.getByText("No triaged findings")).toBeInTheDocument();
    expect(screen.getByText("No findings from runs that used this skill.")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Open Test Quality Reviewer" })).toHaveAttribute("href", "/agents/ag1?tab=skills");
    expect(screen.getByRole("link", { name: "Open Security Reviewer" })).toHaveAttribute("href", "/agents/ag2?tab=skills");
    expect(screen.getByText("disabled")).toBeInTheDocument();
    expect(screen.getByText(/Correlation: findings from runs/)).toBeInTheDocument();
  });

  it("shows rates and the category legend with plain counts", async () => {
    vi.mocked(api.get).mockResolvedValue({
      ...STATS,
      pull_rate: 0.5,
      accept_rate: 0.75,
      findings: 7,
      by_category: [
        { category: "test", count: 5 },
        { category: "bug", count: 2 },
      ],
    });
    renderWithProviders(<StatsTab skillId="s1" />);

    expect(await screen.findByText("50%")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.queryByText("No runs yet")).not.toBeInTheDocument();
    expect(screen.getByText("test")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });
});
