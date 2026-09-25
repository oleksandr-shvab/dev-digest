import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SkillVersion } from "@devdigest/shared";
import { makeSkill, renderWithProviders } from "@/test/render";
import { VersionsTab } from "./VersionsTab";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), postForm: vi.fn() } };
});
import { api } from "@/lib/api";

const base = { description: "Flag branches without tests", type: "rubric" as const };
const VERSIONS: SkillVersion[] = [
  { ...base, version: 2, message: "Edited", created_at: "2026-09-02T10:00:00Z", body: "one\nthree\nfour", current: true },
  { ...base, version: 1, message: "Initial version", created_at: "2026-09-01T10:00:00Z", body: "one\ntwo\nthree", current: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockResolvedValue(VERSIONS);
});

describe("skill VersionsTab", () => {
  it("lists versions newest first; Current has no actions; Diff shows added and removed lines", async () => {
    const user = userEvent.setup();
    renderWithProviders(<VersionsTab skill={makeSkill({ version: 2 })} />);

    expect(await screen.findByText("Initial version")).toBeInTheDocument();
    expect(screen.getByText("2026-09-02")).toBeInTheDocument();
    const [first, second] = screen.getAllByText(/^v\d$/);
    expect(first).toHaveTextContent("v2");
    expect(second).toHaveTextContent("v1");

    // Only the old row has actions; the current row shows the pill.
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Diff/ })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /^Restore/ })).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Diff v1 with current" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("v1 → v2 (current)")).toBeInTheDocument();
    expect(within(dialog).getByText("two").closest("[data-kind]")).toHaveAttribute("data-kind", "del");
    expect(within(dialog).getByText("four").closest("[data-kind]")).toHaveAttribute("data-kind", "add");
    expect(within(dialog).getByText("one").closest("[data-kind]")).toHaveAttribute("data-kind", "ctx");
  });

  it("asks for confirmation before restoring, then calls the restore endpoint", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue(makeSkill({ version: 3 }));
    renderWithProviders(<VersionsTab skill={makeSkill({ version: 2 })} />);

    await user.click(await screen.findByRole("button", { name: "Restore v1" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Restore v1?")).toBeInTheDocument();
    expect(within(dialog).getByText(/Creates v3 with the content of v1/)).toBeInTheDocument();

    // Cancelling changes nothing.
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Restore v1" }));
    await user.click(screen.getByRole("button", { name: "Confirm restore" }));
    expect(api.post).toHaveBeenCalledWith("/skills/s1/versions/1/restore");
    expect(await screen.findByText("Restored v1 as v3")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
