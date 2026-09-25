import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Agent, AgentSkill, Skill } from "@devdigest/shared";
import { makeSkill, renderWithProviders } from "@/test/render";
import { SkillsTab } from "./SkillsTab";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), postForm: vi.fn() } };
});
import { api, ApiError } from "@/lib/api";

const AGENT = { id: "ag1", name: "Test Quality Reviewer" } as Agent;

const A = makeSkill({ id: "a", name: "uncovered-branches", body: "x".repeat(400) });
const B = makeSkill({ id: "b", name: "corner-cases", enabled: false, body: "y".repeat(400) });
const C = makeSkill({ id: "c", name: "over-mocking", type: "convention", body: "z".repeat(400) });
const D = makeSkill({ id: "d", name: "flaky-tests" });

const link = (skill: Skill, order: number, enabled = true): AgentSkill => ({ skill, order, enabled });
const LINKED = [link(A, 0), link(B, 1), link(C, 2)];

const ALL = [A, B, C, D];

/** A tiny stateful fake of the API, so refetches after a save see what was saved. */
function mockApi() {
  let server = LINKED;
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path === "/agents/ag1/skills") return server;
    if (path === "/skills") return ALL;
    throw new Error(`unexpected GET ${path}`);
  });
  vi.mocked(api.put).mockImplementation(async (_path: string, body: unknown) => {
    const { items } = body as { items: { skill_id: string; enabled: boolean }[] };
    server = items.map((it, order) => ({ skill: ALL.find((sk) => sk.id === it.skill_id)!, order, enabled: it.enabled }));
    return {};
  });
}
const rowNames = () => screen.getAllByRole("link").map((l) => l.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  mockApi();
});
afterEach(() => vi.restoreAllMocks());

describe("agent SkillsTab", () => {
  it("renders linked skills in order; the badge excludes globally disabled skills; toggling saves the new set", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SkillsTab agent={AGENT} />);

    await screen.findByText("uncovered-branches");
    expect(rowNames()).toEqual(["uncovered-branches", "corner-cases", "over-mocking"]);
    // 3 linked, but corner-cases is disabled globally → 2 enabled.
    expect(screen.getByText("2 of 3 enabled")).toBeInTheDocument();
    expect(screen.getByText("disabled globally")).toBeInTheDocument();
    // Only enabled skills count toward tokens: 400 + 400 chars → ~200.
    expect(screen.getByText("~200 tokens")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Enable uncovered-branches for this agent" }));
    expect(api.put).toHaveBeenCalledWith("/agents/ag1/skills", {
      items: [
        { skill_id: "a", enabled: false },
        { skill_id: "b", enabled: true },
        { skill_id: "c", enabled: true },
      ],
    });
    // Optimistic: the checkbox and the badge follow the click.
    expect(await screen.findByText("1 of 3 enabled")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Enable uncovered-branches for this agent" })).not.toBeChecked();
  });

  it("reorders with the keyboard (Space, arrows, Space) and saves the new order", async () => {
    const user = userEvent.setup();
    // jsdom has no layout: give each row a rect stacked by DOM position so dnd-kit can pick a neighbour.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const idx = this.parentElement ? Array.from(this.parentElement.children).indexOf(this) : 0;
      const top = idx * 40;
      return { x: 0, y: top, top, left: 0, width: 400, height: 40, right: 400, bottom: top + 40, toJSON: () => ({}) };
    });
    renderWithProviders(<SkillsTab agent={AGENT} />);
    await screen.findByText("uncovered-branches");

    const handle = screen.getByRole("button", { name: "Reorder uncovered-branches" });
    act(() => handle.focus());
    await user.keyboard(" ");
    // dnd-kit announces "picked up" once the drag is active; wait for it before moving.
    await waitFor(() => expect(handle).toHaveAttribute("aria-pressed", "true"));
    await user.keyboard("{ArrowDown}");
    await user.keyboard(" ");

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.put).mock.calls[0]?.[1]).toEqual({
      items: [
        { skill_id: "b", enabled: true },
        { skill_id: "a", enabled: true },
        { skill_id: "c", enabled: true },
      ],
    });
    await waitFor(() => expect(rowNames()).toEqual(["corner-cases", "uncovered-branches", "over-mocking"]));
  });

  it("rolls back the optimistic change when saving fails", async () => {
    const user = userEvent.setup();
    let reject!: (e: Error) => void;
    vi.mocked(api.put).mockImplementation(() => new Promise((_res, rej) => (reject = rej)));
    renderWithProviders(<SkillsTab agent={AGENT} />);

    const box = await screen.findByRole("checkbox", { name: "Enable over-mocking for this agent" });
    expect(box).toBeChecked();
    await user.click(box);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Enable over-mocking for this agent" })).not.toBeChecked());

    reject(new ApiError("boom", 500));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Enable over-mocking for this agent" })).toBeChecked());
    expect(screen.getByText("2 of 3 enabled")).toBeInTheDocument();
  });

  it("links a skill at the end, unlinks on demand, and disables dragging while filtering", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SkillsTab agent={AGENT} />);
    await screen.findByText("uncovered-branches");

    // + Link skill offers only skills that are not linked yet.
    await user.click(screen.getByText("+ Link skill"));
    expect(screen.queryByRole("button", { name: "over-mocking" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "flaky-tests" }));
    expect(vi.mocked(api.put).mock.calls[0]?.[1]).toEqual({
      items: [
        { skill_id: "a", enabled: true },
        { skill_id: "b", enabled: true },
        { skill_id: "c", enabled: true },
        { skill_id: "d", enabled: true },
      ],
    });

    await user.click(screen.getByRole("button", { name: "Unlink corner-cases" }));
    expect(vi.mocked(api.put).mock.calls[1]?.[1]).toEqual({
      items: [
        { skill_id: "a", enabled: true },
        { skill_id: "c", enabled: true },
        { skill_id: "d", enabled: true },
      ],
    });

    await user.type(screen.getByRole("textbox", { name: "Filter skills…" }), "flaky");
    expect(rowNames()).toEqual(["flaky-tests"]);
    const handle = within(screen.getByRole("link", { name: "flaky-tests" }).parentElement as HTMLElement).getByRole("button", {
      name: "Reorder flaky-tests",
    });
    expect(handle).toHaveAttribute("aria-disabled", "true");
  });
});
