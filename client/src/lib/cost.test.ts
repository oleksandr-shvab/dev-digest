import { describe, expect, it } from "vitest";
import { formatUsd } from "./cost";

describe("formatUsd", () => {
  it("renders unknown cost as an em dash, never $0.00", () => {
    expect(formatUsd(null)).toBe("—");
    expect(formatUsd(undefined)).toBe("—");
  });

  it("renders a real zero cost (free model) as $0.00", () => {
    expect(formatUsd(0)).toBe("$0.00");
  });

  it("floors a non-zero sub-cent value below display precision", () => {
    expect(formatUsd(0.00003)).toBe("<$0.0001");
  });

  it("keeps up to 4 decimals, trimming trailing zeros to a minimum of 2", () => {
    expect(formatUsd(0.0013)).toBe("$0.0013");
    expect(formatUsd(0.014)).toBe("$0.014");
    expect(formatUsd(0.003)).toBe("$0.003");
    expect(formatUsd(0.041)).toBe("$0.041");
    expect(formatUsd(0.06)).toBe("$0.06");
  });

  it("pads back to 2 decimals for whole/round dollar values", () => {
    expect(formatUsd(1.5)).toBe("$1.50");
    expect(formatUsd(2)).toBe("$2.00");
  });
});
