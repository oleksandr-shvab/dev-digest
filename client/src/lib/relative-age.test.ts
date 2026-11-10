import { describe, it, expect } from "vitest";
import { relativeAge } from "./relative-age";

const NOW = Date.parse("2026-11-10T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("relativeAge", () => {
  it("maps the elapsed time to a unit and a count", () => {
    expect(relativeAge(ago(10_000), NOW)).toEqual({ unit: "justNow", n: 0 });
    expect(relativeAge(ago(5 * 60_000), NOW)).toEqual({ unit: "minutes", n: 5 });
    expect(relativeAge(ago(3 * 3_600_000 + 1000), NOW)).toEqual({ unit: "hours", n: 3 });
    expect(relativeAge(ago(2 * 86_400_000), NOW)).toEqual({ unit: "days", n: 2 });
    // a timestamp in the future is clamped to "just now"
    expect(relativeAge(ago(-60_000), NOW)).toEqual({ unit: "justNow", n: 0 });
  });
});
