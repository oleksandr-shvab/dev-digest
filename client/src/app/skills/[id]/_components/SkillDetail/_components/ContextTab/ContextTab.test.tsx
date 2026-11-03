import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProjectContextList } from "@devdigest/shared";
import { makeSkill, renderWithProviders } from "@/test/render";
import { useSkill } from "@/lib/hooks/skills";
import { ContextTab } from "./ContextTab";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), postForm: vi.fn() } };
});
const repoState = vi.hoisted(() => ({ repo: { id: "r1", full_name: "acme/payments-api" } as { id: string; full_name: string } | null }));
vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ activeRepo: repoState.repo }) }));
import { api } from "@/lib/api";

const LIST: ProjectContextList = {
  repo_id: "r1",
  status: "ok",
  globs: ["**/{specs,docs,insights}/**/*.md"],
  commit: "a".repeat(40),
  scanned_at: "2026-11-03T09:00:00.000Z",
  total: 3,
  budget_tokens: 20000,
  docs: [
    { path: "docs/webhooks.md", type: "docs", size: 200, tokens: 50, used_by: 0 },
    { path: "specs/public-api.md", type: "specs", size: 400, tokens: 100, used_by: 0 },
    { path: "specs/security-baseline.md", type: "specs", size: 400, tokens: 80, used_by: 0 },
  ],
};

/** Reads the skill from the cache like the detail pane does, so optimistic saves reach the tab. */
function Harness() {
  const { data: skill } = useSkill("s1");
  return skill ? <ContextTab skill={skill} /> : null;
}

/** Text of the "Serializes as" box, newlines intact. */
const serialized = () => document.querySelector("pre")?.textContent;

function mockApi(initial: string[]) {
  let skill = makeSkill({ context_paths: initial });
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path === "/skills/s1") return skill;
    if (path === "/repos/r1/context/docs") return LIST;
    throw new Error(`unexpected GET ${path}`);
  });
  vi.mocked(api.put).mockImplementation(async (_path: string, body: unknown) => {
    skill = { ...skill, context_paths: (body as { paths: string[] }).paths };
    return skill;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  repoState.repo = { id: "r1", full_name: "acme/payments-api" };
});
afterEach(() => vi.restoreAllMocks());

describe("skill ContextTab", () => {
  it("saves a tick at once; the 'Serializes as' box lists the paths in order and never any doc text", async () => {
    const user = userEvent.setup();
    mockApi(["specs/public-api.md"]);
    renderWithProviders(<Harness />);

    expect(await screen.findByText("1 attached")).toBeInTheDocument();
    expect(screen.getByText("Any agent using this skill inherits these documents.")).toBeInTheDocument();
    expect(screen.getByText("Serializes as")).toBeInTheDocument();
    expect(serialized()).toBe("## Project context\n- specs/public-api.md");

    await user.click(await screen.findByRole("checkbox", { name: "Attach docs/webhooks.md" }));
    expect(api.put).toHaveBeenCalledWith("/skills/s1/context", { paths: ["specs/public-api.md", "docs/webhooks.md"] });
    expect(await screen.findByText("2 attached")).toBeInTheDocument();
    expect(serialized()).toBe("## Project context\n- specs/public-api.md\n- docs/webhooks.md");
    // The doc content endpoint is only hit by Preview, never by the serialisation box.
    expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining("/content"));
  });

  it("reorders with the keyboard and saves the new order", async () => {
    const user = userEvent.setup();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const idx = this.parentElement ? Array.from(this.parentElement.children).indexOf(this) : 0;
      const top = idx * 40;
      return { x: 0, y: top, top, left: 0, width: 400, height: 40, right: 400, bottom: top + 40, toJSON: () => ({}) };
    });
    mockApi(["specs/public-api.md", "specs/security-baseline.md"]);
    renderWithProviders(<Harness />);
    await screen.findByText("2 attached");

    const handle = await screen.findByRole("button", { name: "Reorder specs/public-api.md" });
    act(() => handle.focus());
    await user.keyboard(" ");
    await waitFor(() => expect(handle).toHaveAttribute("aria-pressed", "true"));
    await user.keyboard("{ArrowDown}");
    await user.keyboard(" ");

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put).toHaveBeenCalledWith("/skills/s1/context", {
      paths: ["specs/security-baseline.md", "specs/public-api.md"],
    });
    await waitFor(() =>
      expect(serialized()).toBe("## Project context\n- specs/security-baseline.md\n- specs/public-api.md"),
    );
  });

  it("without a selected repo shows the notice and keeps the attached paths detachable", async () => {
    const user = userEvent.setup();
    repoState.repo = null;
    mockApi(["specs/public-api.md"]);
    renderWithProviders(<Harness />);

    expect(await screen.findByText("Select a repo to see its docs")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Attach specs/public-api.md" }));
    expect(api.put).toHaveBeenCalledWith("/skills/s1/context", { paths: [] });
    expect(api.get).not.toHaveBeenCalledWith("/repos/r1/context/docs");
  });
});
