import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { QueryClientProvider } from "@tanstack/react-query";
import type { BlastRadius, PrBrief, PrBriefState } from "@devdigest/shared";
import { makeQueryClient } from "@/test/render";
import { ToastProvider } from "@/lib/toast";
import brief from "../../../../../../../../messages/en/brief.json";
import blast from "../../../../../../../../messages/en/blast.json";
import prReview from "../../../../../../../../messages/en/prReview.json";

// The network boundary: the real hooks run, `@/lib/api` is mocked (keeping the real ApiError).
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn(), postForm: vi.fn() } };
});
import { api, ApiError } from "@/lib/api";
import { OverviewTab } from "./OverviewTab";

afterEach(cleanup);

const BRIEF: PrBrief = {
  summary: "Adds a token-bucket rate limiter to the public API.",
  risks: [],
  review_focus: [{ file: "src/config.ts", line: 12, reason: "Secret key set in plaintext" }],
};

const state = (over: Partial<PrBriefState> = {}): PrBriefState => ({
  pr_id: "pr-1",
  brief: null,
  head_sha: null,
  generated_at: null,
  stale: false,
  provider: null,
  model: null,
  tokens_in: null,
  tokens_out: null,
  cost_usd: null,
  unavailable_inputs: [],
  omitted_inputs: [],
  generating: false,
  last_error: null,
  ...over,
});
const READY = state({
  brief: BRIEF,
  head_sha: "a1b2c3d4e5f6",
  generated_at: new Date().toISOString(),
  tokens_in: 100,
  tokens_out: 50,
  cost_usd: 0.001,
});

const BLAST: BlastRadius = {
  changed_symbols: [{ name: "loadConfig", file: "src/config.ts", kind: "function" }],
  downstream: [],
  summary: "symbols: 1",
  degraded: false,
};
const INDEX_STATE = { status: "full", filesIndexed: 10, filesSkipped: 0, lastIndexedSha: "abc", updatedAt: "2026-01-01T00:00:00.000Z" };

/** What `GET /pulls/pr-1/brief` answers next; the last entry repeats. */
function serve(briefAnswers: PrBriefState[]) {
  const queue = [...briefAnswers];
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path === "/pulls/pr-1/brief") return Promise.resolve(queue.length > 1 ? queue.shift()! : queue[0]!);
    if (path === "/pulls/pr-1/reviews") return Promise.resolve([]);
    if (path === "/pulls/pr-1/intent") return Promise.resolve(null);
    if (path === "/pulls/pr-1/blast") return Promise.resolve(BLAST);
    return Promise.resolve(INDEX_STATE);
  });
}

function renderTab(onOpenFile = vi.fn()) {
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <NextIntlClientProvider locale="en" messages={{ brief, blast, prReview }}>
        <ToastProvider>
          <OverviewTab
            repoId="r1"
            prBody="The PR description"
            prId="pr-1"
            repoFullName="acme/widgets"
            headSha="a1b2c3d4e5f6"
            diffPaths={["src/config.ts"]}
            onOpenFile={onOpenFile}
          />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { onOpenFile };
}

const statusRegion = () => screen.getByRole("status", { name: "PR brief status" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OverviewTab with the PR Brief", () => {
  it("shows the PR Brief block first, with a Generate button, above Intent, Blast radius and the description (AC-1, AC-5)", async () => {
    serve([state()]);
    renderTab();

    const generate = await screen.findByRole("button", { name: "Generate brief" });
    expect(generate).toBeEnabled();
    expect(api.post).not.toHaveBeenCalled(); // nothing is generated on open
    const intent = await screen.findByText("No intent derived yet");
    const blastTitle = await screen.findByText("Blast radius");
    const description = screen.getByText("The PR description");
    const brief = screen.getByText("PR Brief");
    const before = (a: Node, b: Node) => expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    before(brief, intent);
    before(intent, blastTitle);
    before(blastTitle, description);
  });

  it("generates on a click, shows the busy state, then the finished brief once the poll sees it (AC-2, AC-22, AC-30)", async () => {
    const user = userEvent.setup();
    serve([state(), READY]); // first read: nothing stored; after the POST the poll reads the result
    vi.mocked(api.post).mockResolvedValue(state({ generating: true }));
    renderTab();

    await user.click(await screen.findByRole("button", { name: "Generate brief" }));
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith("/pulls/pr-1/brief");
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeDisabled();
    expect(statusRegion()).toHaveTextContent("Generating brief…");

    // BRIEF_POLL_MS = 2000: the next read finds the stored brief.
    expect(await screen.findByText(BRIEF.summary, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(statusRegion()).toHaveTextContent("Brief ready.");
    expect(screen.getByRole("button", { name: "Regenerate brief" })).toBeEnabled();
    expect(api.post).toHaveBeenCalledTimes(1);
  }, 10_000);

  it("shows the busy state again after a reload in the middle of a run, and ends with the stored brief (AC-22, AC-9)", async () => {
    serve([state({ generating: true }), READY]);
    renderTab();

    expect(await screen.findByText("No brief yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeDisabled();
    expect(statusRegion()).toHaveTextContent("Generating brief…");
    expect(api.post).not.toHaveBeenCalled();

    expect(await screen.findByText(BRIEF.summary, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  }, 10_000);

  it("re-reads the server when the click is refused with 409 and shows the run that is already going (AC-23)", async () => {
    const user = userEvent.setup();
    serve([state(), state({ generating: true })]); // another tab started a run after this page loaded
    vi.mocked(api.post).mockRejectedValue(new ApiError("A brief generation is already running for this PR", 409, "conflict"));
    renderTab();

    await user.click(await screen.findByRole("button", { name: "Generate brief" }));

    await waitFor(() => expect(statusRegion()).toHaveTextContent("Generating brief…"));
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeDisabled();
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("opens Files changed from a Review focus item through the onOpenFile prop (AC-8, AC-20)", async () => {
    const user = userEvent.setup();
    serve([READY]);
    const { onOpenFile } = renderTab();

    await user.click(await screen.findByRole("button", { name: "Open src/config.ts line 12 in Files changed" }));
    expect(onOpenFile).toHaveBeenCalledWith("src/config.ts", 12);
  });
});
