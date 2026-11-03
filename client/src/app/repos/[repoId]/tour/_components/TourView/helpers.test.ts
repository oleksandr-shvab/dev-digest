import { describe, it, expect } from "vitest";
import type { OnboardingTour, OnboardingTourState } from "@devdigest/shared";
import { canGenerate, viewOf } from "./helpers";

const tour = { repo_id: "r1" } as OnboardingTour;
const state = (over: Partial<OnboardingTourState> = {}): OnboardingTourState => ({
  repo_id: "r1",
  tour: null,
  generating: false,
  last_error: null,
  index: { ready: true, reason: null, status: "full", indexed_sha: "a", file_count: 1 },
  ...over,
});

describe("viewOf", () => {
  it("picks loading, error, empty and ready, and lets a stored tour win", () => {
    expect(viewOf({ data: undefined, isLoading: true, isError: false })).toBe("loading");
    expect(viewOf({ data: undefined, isLoading: false, isError: true })).toBe("error");
    expect(viewOf({ data: state(), isLoading: false, isError: false })).toBe("empty");
    expect(viewOf({ data: state({ tour }), isLoading: false, isError: false })).toBe("ready");
    // A failed background refetch keeps the stored tour on screen.
    expect(viewOf({ data: state({ tour }), isLoading: false, isError: true })).toBe("ready");
  });
});

describe("canGenerate", () => {
  it("needs a ready index and no running generation", () => {
    expect(canGenerate(state())).toBe(true);
    expect(canGenerate(state({ generating: true }))).toBe(false);
    expect(canGenerate(state({ index: { ...state().index, ready: false, reason: "no_data" } }))).toBe(false);
  });
});
