import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { SkillsApplied } from "./SkillsApplied";

describe("SkillsApplied", () => {
  it("lists each applied skill with version and tokens, and marks imported ones", () => {
    renderWithProviders(
      <SkillsApplied
        skills={[
          { id: "a", name: "uncovered-branches", version: 5, source: "manual", tokens: 410 },
          { id: "b", name: "flaky-tests", version: 1, source: "imported_file", tokens: 120 },
        ]}
      />,
    );
    expect(screen.getByText("uncovered-branches v5 · 410 tok")).toBeInTheDocument();
    const imported = screen.getByText(/flaky-tests v1 · 120 tok/);
    expect(imported).toHaveTextContent("imported");
    expect(screen.getAllByText("imported")).toHaveLength(1);
  });
});
