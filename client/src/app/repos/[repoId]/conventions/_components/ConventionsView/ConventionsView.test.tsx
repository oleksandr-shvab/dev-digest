import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ConventionCandidate, ConventionScanResult } from "@devdigest/shared";
import { makeConvention, renderWithProviders } from "@/test/render";
import { ConventionsView } from "./ConventionsView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn(), postForm: vi.fn() } };
});
import { api } from "@/lib/api";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ConventionsView", () => {
  it("empty state shows Run Scan; a completed scan replaces it with ReScan and renders the cards", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue([]);
    const candidates: ConventionCandidate[] = [makeConvention()];
    const scanResult: ConventionScanResult = { candidates, samples: ["a.ts"], dropped: [{ rule: "x", reason: "path_not_sampled" }], model: "gpt-5.4" };
    vi.mocked(api.post).mockResolvedValue(scanResult);

    renderWithProviders(<ConventionsView repoId="r1" repoFullName="acme/widgets" />);
    expect(await screen.findByText("No conventions extracted yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ReScan" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Run Scan" }));
    expect(api.post).toHaveBeenCalledWith("/repos/r1/conventions/extract");

    expect(await screen.findByText("Use camelCase for variables.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ReScan" })).toBeInTheDocument();
    expect(await screen.findByText("Kept 1 candidate(s) · 1 dropped (no evidence)")).toBeInTheDocument();
  });

  it("Create skill only appears once at least one candidate is accepted", async () => {
    vi.mocked(api.get).mockResolvedValue([
      makeConvention({ id: "p1", status: "pending" }),
      makeConvention({ id: "a1", status: "accepted", rule: "Accepted rule." }),
    ]);
    renderWithProviders(<ConventionsView repoId="r1" repoFullName="acme/widgets" />);
    expect(await screen.findByText("Accepted rule.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create skill (1 accepted)" })).toBeInTheDocument();
  });

  it("hides Create skill with zero accepted candidates", async () => {
    vi.mocked(api.get).mockResolvedValue([makeConvention({ status: "pending" })]);
    renderWithProviders(<ConventionsView repoId="r1" repoFullName="acme/widgets" />);
    await screen.findByText("Use camelCase for variables.");
    expect(screen.queryByRole("button", { name: /Create skill/ })).not.toBeInTheDocument();
  });

  it("filter chips narrow the list by status", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue([
      makeConvention({ id: "p1", status: "pending", rule: "Pending rule." }),
      makeConvention({ id: "a1", status: "accepted", rule: "Accepted rule." }),
    ]);
    renderWithProviders(<ConventionsView repoId="r1" repoFullName="acme/widgets" />);
    await screen.findByText("Pending rule.");
    expect(screen.getByText("Accepted rule.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Accepted (1)" }));
    expect(screen.queryByText("Pending rule.")).not.toBeInTheDocument();
    expect(screen.getByText("Accepted rule.")).toBeInTheDocument();
  });

  it("a reject makes the card disappear at once, and it stays gone after the server-truth refetch", async () => {
    const user = userEvent.setup();
    // The server's GET never returns rejected rows (repository.listPendingAndAccepted) —
    // the refetch after settle sees an empty list, confirming it doesn't come back.
    vi.mocked(api.get)
      .mockResolvedValueOnce([makeConvention({ id: "p1", status: "pending" })])
      .mockResolvedValue([]);
    vi.mocked(api.patch).mockResolvedValue(makeConvention({ id: "p1", status: "rejected" }));
    renderWithProviders(<ConventionsView repoId="r1" repoFullName="acme/widgets" />);
    await screen.findByText("Use camelCase for variables.");

    await user.click(screen.getByRole("button", { name: /^Reject:/ }));
    await waitFor(() => expect(screen.queryByText("Use camelCase for variables.")).not.toBeInTheDocument());
    expect(api.patch).toHaveBeenCalledWith("/conventions/p1", { status: "rejected" });
    await waitFor(() => expect(screen.getByText("No conventions extracted yet")).toBeInTheDocument());
  });
});
