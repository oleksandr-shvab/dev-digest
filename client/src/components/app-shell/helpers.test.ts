import { describe, it, expect } from "vitest";
import { activeKeyFor } from "./helpers";

describe("activeKeyFor", () => {
  it("maps the repo tour page to the Onboarding Tour entry, and leaves /onboarding unmapped", () => {
    expect(activeKeyFor("/repos/r1/tour")).toBe("onboarding-tour");
    expect(activeKeyFor("/repos/r1/tour/")).toBe("onboarding-tour");
    expect(activeKeyFor("/onboarding")).toBe("");
    expect(activeKeyFor("/repos/r1/context")).toBe("context");
    expect(activeKeyFor("/repos/r1/pulls")).toBe("pulls");
    expect(activeKeyFor("/repos/r1/pulls/12")).toBe("pulls");
  });
});
