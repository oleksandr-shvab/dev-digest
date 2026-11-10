import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrBriefState } from "@devdigest/shared";

// The network boundary: mock @/lib/api, keeping the real ApiError.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn(), postForm: vi.fn() } };
});
import { api, ApiError } from "@/lib/api";
import { BRIEF_POLL_MS, briefKey, useGeneratePrBrief, usePrBrief } from "./brief";

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

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

/** Lets pending promises settle and moves the fake clock forward. */
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("usePrBrief", () => {
  it("polls every BRIEF_POLL_MS while the server reports generating, and stops once it is done", async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce(state({ generating: true }))
      .mockResolvedValueOnce(state({ generating: true }))
      .mockResolvedValue(state({ generating: false, last_error: null }));
    const { wrapper } = setup();
    const { result } = renderHook(() => usePrBrief("pr-1"), { wrapper });

    await advance(0);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith("/pulls/pr-1/brief");
    expect(result.current.data?.generating).toBe(true);

    await advance(BRIEF_POLL_MS - 1);
    expect(api.get).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(api.get).toHaveBeenCalledTimes(2);

    await advance(BRIEF_POLL_MS); // third read says "done"
    expect(api.get).toHaveBeenCalledTimes(3);
    await advance(10); // let the third answer reach the observer
    expect(result.current.data?.generating).toBe(false);

    await advance(BRIEF_POLL_MS * 5);
    expect(api.get).toHaveBeenCalledTimes(3);
  });

  it("does not poll when nothing is generating, and does not fetch without a PR id", async () => {
    vi.mocked(api.get).mockResolvedValue(state());
    const { wrapper } = setup();
    renderHook(() => usePrBrief("pr-1"), { wrapper });
    renderHook(() => usePrBrief(null), { wrapper });
    renderHook(() => usePrBrief(undefined), { wrapper });

    await advance(BRIEF_POLL_MS * 5);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith("/pulls/pr-1/brief");
  });
});

describe("useGeneratePrBrief", () => {
  it("POSTs without a body and puts the answer in the cache without a second read", async () => {
    const started = state({ generating: true });
    vi.mocked(api.post).mockResolvedValue(started);
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useGeneratePrBrief("pr-1"), { wrapper });

    await act(async () => {
      result.current.mutate();
    });
    await advance(0);

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.post).mock.calls[0]).toEqual(["/pulls/pr-1/brief"]);
    expect(qc.getQueryData(briefKey("pr-1"))).toEqual(started);
    expect(api.get).not.toHaveBeenCalled();
  });

  it("re-reads the server state when the POST is refused with 409, and polling resumes from it", async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce(state()) // the page opened on an idle state
      .mockResolvedValue(state({ generating: true })); // another tab had started a run
    vi.mocked(api.post).mockRejectedValue(new ApiError("A brief generation is already running", 409, "conflict"));
    const { wrapper } = setup();
    const { result } = renderHook(() => ({ query: usePrBrief("pr-1"), generate: useGeneratePrBrief("pr-1") }), {
      wrapper,
    });
    await advance(0);
    expect(result.current.query.data?.generating).toBe(false);
    expect(api.get).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.generate.mutate();
    });
    await advance(0);

    expect(result.current.generate.isError).toBe(true);
    expect(api.get).toHaveBeenCalledTimes(2); // invalidated and re-read
    expect(result.current.query.data?.generating).toBe(true);

    await advance(BRIEF_POLL_MS);
    expect(api.get).toHaveBeenCalledTimes(3); // and the poll started
  });
});
