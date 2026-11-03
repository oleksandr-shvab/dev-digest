import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { OnThisPage } from "./OnThisPage";

const SECTIONS = [
  { id: "architecture", title: "Architecture overview" },
  { id: "critical-paths", title: "Critical paths" },
  { id: "run-locally", title: "How to run locally" },
  { id: "reading-path", title: "Guided reading path" },
  { id: "first-tasks", title: "First tasks" },
];

describe("OnThisPage", () => {
  it("lists the sections in order, marks the current one and selects by click and Enter", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithProviders(<OnThisPage sections={SECTIONS} currentId="run-locally" onSelect={onSelect} />);

    const nav = screen.getByRole("navigation", { name: "On this page" });
    expect(within(nav).getAllByRole("button").map((b) => b.textContent?.replace("•", ""))).toEqual(
      SECTIONS.map((x) => x.title),
    );
    expect(within(nav).getByRole("button", { name: "How to run locally" })).toHaveAttribute("aria-current", "location");
    expect(within(nav).getByRole("button", { name: "First tasks" })).not.toHaveAttribute("aria-current");
    expect(within(nav).getByText("•")).toBeInTheDocument();

    await user.click(within(nav).getByRole("button", { name: "First tasks" }));
    expect(onSelect).toHaveBeenLastCalledWith("first-tasks");

    onSelect.mockClear();
    within(nav).getByRole("button", { name: "First tasks" }).focus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith("first-tasks");
  });
});
