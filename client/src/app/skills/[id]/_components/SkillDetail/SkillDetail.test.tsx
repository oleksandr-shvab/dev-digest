import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@/lib/api";
import { makeSkill, renderWithProviders } from "@/test/render";
import { SkillDetail } from "./SkillDetail";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), postForm: vi.fn() } };
});
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
import { api } from "@/lib/api";

const SKILL = makeSkill({ stats: { used_by: 3, pull_rate: 0.5, accept_rate: 0.5 } });

/** Owns the ?tab= state the route page normally provides. */
function Harness({ id = "s1", initial = "config" }: { id?: string; initial?: string }) {
  const [tab, setTab] = React.useState(initial);
  return <SkillDetail id={id} tab={tab} onTab={setTab} />;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path === "/skills/s1") return SKILL;
    if (path === "/skills/s1/versions") return [];
    throw new ApiError("not found", 404);
  });
});
afterEach(() => vi.restoreAllMocks());

describe("SkillDetail", () => {
  it("keeps unsaved Config edits across tabs; Preview shows the saved body and says so", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    expect(await screen.findByRole("heading", { name: "uncovered-branches" })).toBeInTheDocument();
    expect(screen.getAllByText("v1").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Run on evals" })).toBeDisabled();

    await user.type(screen.getByRole("textbox", { name: "Skill body" }), " EDITED");
    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByText("You have unsaved edits — the preview shows the saved version.")).toBeInTheDocument();
    expect(screen.getByText("Check every branch.")).toBeInTheDocument();
    expect(screen.queryByText(/EDITED/, { selector: "p" })).not.toBeInTheDocument();

    // Back on Config the edit is still there.
    await user.click(screen.getByRole("button", { name: "Config" }));
    expect(screen.getByRole("textbox", { name: "Skill body" })).toHaveValue("# Rule\nCheck every branch. EDITED");

    // The Evals tab is a stub and makes no request.
    vi.mocked(api.get).mockClear();
    await user.click(screen.getByRole("button", { name: "Evals" }));
    expect(screen.getByText("Evals for skills arrive in a later lesson.")).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("deletes after confirming, naming how many agents it will be unlinked from", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.mocked(api.del).mockResolvedValue({ ok: true });
    renderWithProviders(<Harness />);
    await screen.findByRole("heading", { name: "uncovered-branches" });

    await user.click(screen.getByRole("button", { name: "Skill actions" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(confirm).toHaveBeenLastCalledWith("Used by 3 agents — it will be unlinked from them.");
    expect(api.del).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Skill actions" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/skills"));
    expect(api.del).toHaveBeenCalledWith("/skills/s1");
  });

  it("shows the empty create form for /skills/new and a not-found state for an unknown id", async () => {
    const { unmount } = renderWithProviders(<Harness id="new" />);
    expect(screen.getByRole("heading", { name: "New skill" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Preview" })).not.toBeInTheDocument();
    unmount();

    renderWithProviders(<Harness id="missing" />);
    expect(await screen.findByText("Skill not found")).toBeInTheDocument();
  });
});
