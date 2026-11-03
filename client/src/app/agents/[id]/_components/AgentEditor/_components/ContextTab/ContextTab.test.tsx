import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AgentSkill, ProjectContextList } from "@devdigest/shared";
import { makeAgent, makeSkill, renderWithProviders } from "@/test/render";
import { useAgent } from "@/lib/hooks/agents";
import { ContextTab } from "./ContextTab";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), postForm: vi.fn() } };
});
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", full_name: "acme/payments-api" } }),
}));
import { api } from "@/lib/api";

const LIST: ProjectContextList = {
  repo_id: "r1",
  status: "ok",
  globs: ["**/{specs,docs,insights}/**/*.md"],
  commit: "a".repeat(40),
  scanned_at: "2026-11-03T09:00:00.000Z",
  total: 3,
  budget_tokens: 400,
  docs: [
    { path: "docs/data-retention.md", type: "docs", size: 3000, tokens: 700, used_by: 0 },
    { path: "docs/webhooks.md", type: "docs", size: 200, tokens: 50, used_by: 0 },
    { path: "specs/public-api.md", type: "specs", size: 400, tokens: 100, used_by: 0 },
  ],
};

const SKILL = makeSkill({ id: "sk1", name: "api-rubric", context_paths: ["docs/webhooks.md"] });
const LINKS: AgentSkill[] = [{ skill: SKILL, order: 0, enabled: true }];

/** Reads the agent from the cache like the editor page does, so optimistic saves reach the tab. */
function Harness() {
  const { data: agent } = useAgent("a1");
  return agent ? <ContextTab agent={agent} /> : null;
}

/** A tiny stateful fake of the API: a save is visible to later refetches. */
function mockApi(links: AgentSkill[] = LINKS, list: ProjectContextList = LIST) {
  let agent = makeAgent();
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path === "/agents/a1") return agent;
    if (path === "/repos/r1/context/docs") return list;
    if (path === "/agents/a1/skills") return links;
    throw new Error(`unexpected GET ${path}`);
  });
  vi.mocked(api.put).mockImplementation(async (_path: string, body: unknown) => {
    agent = { ...agent, context_paths: (body as { paths: string[] }).paths };
    return agent;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("agent ContextTab", () => {
  it("saves a tick at once, updates the badge, and counts inherited docs in the badge and the token total", async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithProviders(<Harness />);

    // One doc inherited through the enabled skill: counted, read-only, marked "via".
    expect(await screen.findByText("1 of 3 attached")).toBeInTheDocument();
    expect(screen.getByText("via api-rubric")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Attach docs/webhooks.md" })).not.toBeInTheDocument();
    expect(screen.getByText(/≈ 50 tokens · Injected as an untrusted block \(## Project context\) into every run\./)).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Attach specs/public-api.md" }));
    expect(api.put).toHaveBeenCalledWith("/agents/a1/context", { paths: ["specs/public-api.md"] });
    expect(await screen.findByText("2 of 3 attached")).toBeInTheDocument();
    expect(screen.getByText(/≈ 150 tokens ·/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Attach specs/public-api.md" })).toHaveAttribute("aria-checked", "true");
  });

  it("warns, naming the budget and the docs that will be skipped, when the total exceeds the per-run budget", async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithProviders(<Harness />);
    await screen.findByText("1 of 3 attached");
    expect(screen.queryByText(/exceed the per-run budget/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Attach docs/data-retention.md" }));
    // Own docs come first: data-retention (700) alone is over 400, so it is skipped; the inherited 50 still fits.
    const warning = await screen.findByText(/exceed the per-run budget of 400 tokens/);
    expect(warning).toHaveTextContent("docs/data-retention.md");
    expect(warning).not.toHaveTextContent("docs/webhooks.md");
    expect(warning.closest("[aria-live='polite']")).not.toBeNull();
  });

  it("ignores docs from a disabled skill link", async () => {
    mockApi([{ skill: SKILL, order: 0, enabled: false }]);
    renderWithProviders(<Harness />);
    expect(await screen.findByText("0 of 3 attached")).toBeInTheDocument();
    expect(screen.queryByText("via api-rubric")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Attach docs/webhooks.md" })).toBeInTheDocument());
  });
});
