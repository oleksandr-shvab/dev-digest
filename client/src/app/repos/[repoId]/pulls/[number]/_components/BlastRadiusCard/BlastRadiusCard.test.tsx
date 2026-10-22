import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BlastRadius } from "@devdigest/shared";
import { renderWithProviders } from "@/test/render";
import blastMessages from "../../../../../../../../messages/en/blast.json";
import { BlastRadiusCard } from "./BlastRadiusCard";
import { RESYNC_POLL_TIMEOUT_MS } from "./_components/ResyncButton/constants";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn(), postForm: vi.fn() } };
});
import { api } from "@/lib/api";

const MAP: BlastRadius = {
  changed_symbols: [
    { name: "rateLimit", file: "src/middleware/ratelimit.ts", kind: "function" },
    { name: "parseToken", file: "src/auth/token.ts", kind: "function" },
    { name: "Limits", file: "src/middleware/ratelimit.ts", kind: "interface" },
  ],
  downstream: [
    {
      symbol: "rateLimit",
      callers: [
        { name: "handler", file: "src/routes/users.ts", line: 10 },
        { name: "syncJob", file: "src/jobs/sync.ts", line: 5 },
      ],
      endpoints_affected: ["GET /users"],
      crons_affected: ["sync-users"],
    },
    {
      symbol: "parseToken",
      callers: [{ name: "handler", file: "src/routes/users.ts", line: 14 }],
      endpoints_affected: ["GET /users"],
      crons_affected: [],
    },
  ],
  summary: "symbols: 3, callers: 2, endpoints: 1, crons: 1",
  degraded: false,
};

const INDEX_STATE = {
  status: "partial",
  filesIndexed: 10,
  filesSkipped: 2,
  lastIndexedSha: "abc",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

/** Routes `api.get` by path: the blast map for `/blast`, a stable index state for `/index-state`. */
function mockGet(map: BlastRadius) {
  vi.mocked(api.get).mockImplementation((path: string) =>
    Promise.resolve(path.endsWith("/blast") ? map : INDEX_STATE),
  );
}

const REASONS = ["flag_off", "index_failed", "index_partial", "repo_too_large", "no_data"] as const;

function renderCard(props: { repoFullName?: string | null } = {}) {
  return renderWithProviders(
    <BlastRadiusCard repoId="r1" prId="p1" repoFullName={props.repoFullName === undefined ? "acme/widgets" : props.repoFullName} headSha="abc123" />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("BlastRadiusCard", () => {
  it("shows the summary and each changed symbol's callers as GitHub links with endpoint and cron chips", async () => {
    mockGet(MAP);
    renderCard();

    expect(screen.getByRole("status", { name: "Loading the blast radius…" })).toBeInTheDocument();
    expect(await screen.findByRole("listitem", { name: "3 symbols" })).toBeInTheDocument();
    // The caller `handler` in users.ts reaches two symbols and the endpoint two groups: each counts once.
    expect(screen.getByRole("listitem", { name: "2 callers" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "1 endpoints" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "1 cron/jobs" })).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: /rateLimit/ })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "src/routes/users.ts:10" });
    expect(link).toHaveAttribute("href", "https://github.com/acme/widgets/blob/abc123/src/routes/users.ts#L10");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));

    expect(within(screen.getAllByRole("list", { name: "HTTP endpoints" })[0]!).getByText("GET /users")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Cron jobs" })).getByText("sync-users")).toBeInTheDocument();
    for (const text of Object.values(blastMessages.badge)) expect(screen.queryByText(text)).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/pulls/p1/blast");
  });

  it.each(REASONS)("a degraded map (%s) shows its badge and still shows the map under it", async (reason) => {
    mockGet({ ...MAP, degraded: true, reason });
    renderCard();

    expect(await screen.findByText(blastMessages.badge[reason])).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "src/routes/users.ts:10" })).toBeInTheDocument();
  });

  it("with no callers it says so, keeps the no_data badge and shows no group", async () => {
    mockGet({
      changed_symbols: MAP.changed_symbols.slice(0, 2),
      downstream: [],
      summary: "symbols: 2, callers: 0, endpoints: 0, crons: 0",
      degraded: true,
      reason: "no_data",
    });
    renderCard();

    expect(await screen.findByText("2 changed symbol(s), no downstream callers found.")).toBeInTheDocument();
    expect(screen.getByText(blastMessages.badge.no_data)).toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("shows an error when the request fails", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("boom"));
    renderCard();

    expect(await screen.findByText("Could not load the blast radius.")).toBeInTheDocument();
  });

  it("without a known repository the caller is plain text, not a link", async () => {
    mockGet(MAP);
    renderCard({ repoFullName: null });

    expect(await screen.findByText("src/routes/users.ts:10")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("Resync refreshes the block once the index advances", async () => {
    const user = userEvent.setup();
    let blastCalls = 0;
    let stateCalls = 0;
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/pulls/p1/blast") {
        blastCalls += 1;
        return Promise.resolve<BlastRadius>(
          blastCalls === 1 ? { ...MAP, degraded: true, reason: "index_partial" } : { ...MAP, degraded: false },
        );
      }
      stateCalls += 1;
      return Promise.resolve({
        ...INDEX_STATE,
        updatedAt: stateCalls === 1 ? "2026-01-01T00:00:00.000Z" : "2026-01-02T00:00:00.000Z",
      });
    });
    vi.mocked(api.post).mockResolvedValue({ status: "accepted", jobId: "j1" });
    renderCard();

    expect(await screen.findByText(blastMessages.badge.index_partial)).toBeInTheDocument();
    const resync = screen.getByRole("button", { name: "Resync index" });
    await waitFor(() => expect(resync).toBeEnabled());
    await user.click(resync);

    expect(api.post).toHaveBeenCalledWith("/repos/r1/resync");
    await waitFor(() => expect(screen.queryByText(blastMessages.badge.index_partial)).not.toBeInTheDocument());
    expect(screen.getByRole("link", { name: "src/routes/users.ts:10" })).toBeInTheDocument();
  });

  it("Resync gives up when the index never advances: the button is usable again and a timeout note appears", async () => {
    // Only `Date` is faked, so the real 1.5 s index-state poll keeps running; moving the clock past the
    // timeout makes the next poll's `dataUpdatedAt` (a `Date.now()` stamp) overdue, with no fake-timer/userEvent clash.
    vi.useFakeTimers({ toFake: ["Date"] });
    const user = userEvent.setup();
    mockGet({ ...MAP, degraded: true, reason: "index_partial" }); // the index state never changes: updatedAt stays the same
    vi.mocked(api.post).mockResolvedValue({ status: "accepted", jobId: "j1" });
    renderCard();

    const resync = await screen.findByRole("button", { name: "Resync index" });
    await waitFor(() => expect(resync).toBeEnabled());
    await user.click(resync);

    expect(api.post).toHaveBeenCalledWith("/repos/r1/resync");
    expect(await screen.findByRole("button", { name: "Resyncing…" })).toBeDisabled();
    expect(screen.queryByText(blastMessages.resync.timeout)).not.toBeInTheDocument();

    vi.setSystemTime(Date.now() + RESYNC_POLL_TIMEOUT_MS + 1);

    const note = await screen.findByText("The resync did not finish in time. Check the API log.", {}, { timeout: 5000 });
    expect(note).toHaveAttribute("role", "status");
    expect(screen.getByRole("button", { name: "Resync index" })).toBeEnabled();
  });

  it("a failed resync request clears the attempt: the button is usable again and no timeout note shows", async () => {
    const user = userEvent.setup();
    mockGet({ ...MAP, degraded: true, reason: "index_partial" });
    let rejectPost: (e: Error) => void = () => {};
    vi.mocked(api.post).mockReturnValue(new Promise((_, reject) => (rejectPost = reject)));
    renderCard();

    const resync = await screen.findByRole("button", { name: "Resync index" });
    await waitFor(() => expect(resync).toBeEnabled());
    await user.click(resync);
    expect(await screen.findByRole("button", { name: "Resyncing…" })).toBeDisabled();

    rejectPost(new Error("boom"));

    await waitFor(() => expect(screen.getByRole("button", { name: "Resync index" })).toBeEnabled());
    expect(screen.queryByRole("button", { name: "Resyncing…" })).not.toBeInTheDocument();
    expect(screen.queryByText(blastMessages.resync.timeout)).not.toBeInTheDocument();
  });

  it("a symbol collapses and expands", async () => {
    const user = userEvent.setup();
    mockGet(MAP);
    renderCard();

    const toggle = await screen.findByRole("button", { name: /rateLimit/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "src/routes/users.ts:10" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /parseToken/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "src/routes/users.ts:14" })).toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByRole("link", { name: "src/routes/users.ts:10" })).toBeInTheDocument();
  });
});
