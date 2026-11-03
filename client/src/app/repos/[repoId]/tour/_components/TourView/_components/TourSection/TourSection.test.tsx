import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { TourSection } from "./TourSection";

describe("TourSection", () => {
  it("collapses and expands from the header toggle, by click and by Enter", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <TourSection id="critical-paths" icon="Target" title="Critical paths">
        <p>body text</p>
      </TourSection>,
    );

    const toggle = screen.getByRole("button", { name: "Toggle Critical paths" });
    expect(screen.getByRole("heading", { level: 2, name: "Critical paths" })).toHaveAttribute(
      "id",
      "critical-paths-heading",
    );
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("aria-controls", "critical-paths-body");
    expect(screen.getByText("body text")).toBeVisible();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("body text")).not.toBeVisible();

    toggle.focus();
    await user.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("body text")).toBeVisible();

    await user.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.keyboard("{Enter}");
    expect(screen.getByText("body text")).toBeVisible();
  });
});
