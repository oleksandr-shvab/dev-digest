import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProjectContextDocContent, ProjectContextList } from "@devdigest/shared";
import { renderWithProviders } from "@/test/render";
import { ContextView } from "./ContextView";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), postForm: vi.fn() } };
});
import { api } from "@/lib/api";

const GLOB = "**/{specs,docs,insights}/**/*.md";
const list = (over: Partial<ProjectContextList> = {}): ProjectContextList => ({
  repo_id: "r1",
  status: "ok",
  globs: [GLOB],
  commit: "a".repeat(40),
  scanned_at: new Date(Date.now() - 2 * 60_000).toISOString(),
  total: 3,
  budget_tokens: 20000,
  docs: [
    { path: "docs/webhooks.md", type: "docs", size: 200, tokens: 50, used_by: 0 },
    { path: "specs/public-api.md", type: "specs", size: 400, tokens: 100, used_by: 1 },
    { path: "specs/security-baseline.md", type: "specs", size: 400, tokens: 80, used_by: 3 },
  ],
  ...over,
});
const content = (path: string, text: string): ProjectContextDocContent => ({
  path,
  type: "specs",
  size: text.length,
  tokens: 10,
  content: text,
});

function mockApi(l: ProjectContextList, docs: Record<string, string> = {}) {
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path === "/repos/r1/context/docs") return l;
    const m = path.match(/content\?path=(.+)$/);
    if (m) {
      const p = decodeURIComponent(m[1]!);
      return content(p, docs[p] ?? "");
    }
    throw new Error(`unexpected GET ${path}`);
  });
}

const view = () => renderWithProviders(<ContextView repoId="r1" repoFullName="acme/payments-api" branch="main" />);

beforeEach(() => vi.clearAllMocks());

describe("ContextView", () => {
  it("lists docs with type and tokens, filters by path, and renders the selected doc as Markdown with Used by", async () => {
    const user = userEvent.setup();
    mockApi(list(), { "specs/security-baseline.md": "# Security baseline\n\nNever log secrets." });
    view();

    expect(await screen.findByText("specs/public-api.md")).toBeInTheDocument();
    expect(screen.getByText("acme/payments-api · main")).toBeInTheDocument();
    expect(screen.getByText("≈ 50 tokens")).toBeInTheDocument();
    expect(screen.getAllByText("specs")).toHaveLength(2);

    await user.type(screen.getByRole("textbox", { name: "Filter by path…" }), "security");
    expect(screen.queryByText("specs/public-api.md")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /specs\/security-baseline\.md/ }));
    expect(await screen.findByRole("heading", { name: "Security baseline" })).toBeInTheDocument();
    expect(screen.getByText("Used by 3 agents")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/repos/r1/context/docs/content?path=specs%2Fsecurity-baseline.md");

    // Read-only: nothing that edits, creates, uploads or deletes a file.
    expect(screen.queryByRole("button", { name: /edit|new|upload|delete|save/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /edit|new|upload|delete|save/i })).not.toBeInTheDocument();
  });

  it("neutralises raw HTML and javascript: links in a doc", async () => {
    const user = userEvent.setup();
    mockApi(list(), {
      "specs/public-api.md": "Hello <script>window.__pwned = 1</script>\n\n[x](javascript:alert(1))\n\n<img src=x onerror=alert(1)>",
    });
    view();
    await user.click(await screen.findByRole("button", { name: /specs\/public-api\.md/ }));

    await screen.findByText("x");
    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
    const links = Array.from(document.querySelectorAll("a"));
    expect(links.every((a) => !(a.getAttribute("href") ?? "").toLowerCase().startsWith("javascript:"))).toBe(true);
  });

  it("shows the reason and the globs for a repo with no mirror and for one with no matching docs", async () => {
    mockApi(list({ status: "no_mirror", docs: [], total: 0, commit: null }));
    const { unmount } = view();
    expect(await screen.findByText("No synced copy of this repo yet")).toBeInTheDocument();
    expect(screen.getByText(`Search globs: ${GLOB}`)).toBeInTheDocument();
    unmount();

    mockApi(list({ status: "no_matches", docs: [], total: 0, globs: ["a/**/*.md", "b/**/*.md"] }));
    view();
    expect(await screen.findByText("No documents match the search globs")).toBeInTheDocument();
    expect(screen.getByText("Search globs: a/**/*.md; b/**/*.md")).toBeInTheDocument();
  });

  it("tells the user when the list is capped", async () => {
    mockApi(list({ total: 1001 }));
    view();
    expect(await screen.findByText("Showing 3 of 1,001 docs — narrow the filter or the search roots")).toBeInTheDocument();
  });

  it("Rescan refetches the list and updates the footer", async () => {
    const user = userEvent.setup();
    mockApi(list());
    view();
    expect(await screen.findByText("3 files · ≈ 230 tokens total · scanned 2m ago")).toBeInTheDocument();

    mockApi(
      list({
        docs: [{ path: "specs/public-api.md", type: "specs", size: 400, tokens: 100, used_by: 1 }],
        total: 1,
        scanned_at: new Date().toISOString(),
      }),
    );
    vi.mocked(api.get).mockClear();
    await user.click(screen.getByRole("button", { name: "Rescan" }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/repos/r1/context/docs"));
    expect(await screen.findByText("1 file · ≈ 100 tokens total · scanned 0s ago")).toBeInTheDocument();
  });
});
