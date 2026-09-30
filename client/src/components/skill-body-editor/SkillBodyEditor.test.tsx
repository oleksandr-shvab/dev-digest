import React from "react";
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { SkillBodyEditor } from "./SkillBodyEditor";

describe("SkillBodyEditor", () => {
  it("keeps the line-number gutter in step with the text, and Tab inserts two spaces", async () => {
    const user = userEvent.setup();
    const Harness = () => {
      const [v, setV] = React.useState("a\nb");
      return <SkillBodyEditor name="rule" value={v} onChange={setV} dirty />;
    };
    renderWithProviders(<Harness />);

    expect(screen.getByText("rule.md")).toBeInTheDocument();
    expect(screen.getByText("unsaved")).toBeInTheDocument();
    expect(screen.getAllByText(/^\d+$/).map((n) => n.textContent)).toEqual(["1", "2"]);

    const area = screen.getByRole("textbox", { name: "Skill body" });
    await user.type(area, "\nc\nd");
    expect(screen.getAllByText(/^\d+$/)).toHaveLength(4);
    expect(screen.getByText("~2 tokens")).toBeInTheDocument();

    await user.type(area, "{Tab}x");
    expect(area).toHaveValue("a\nb\nc\nd  x");
  });

  it("hides the unsaved chip for a clean body", () => {
    renderWithProviders(<SkillBodyEditor name="" value="" onChange={vi.fn()} dirty={false} />);
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
    expect(screen.getByText("untitled.md")).toBeInTheDocument();
  });
});
