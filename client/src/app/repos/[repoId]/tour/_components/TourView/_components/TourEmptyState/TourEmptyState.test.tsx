import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { TourEmptyState } from "./TourEmptyState";

describe("TourEmptyState", () => {
  it("says what the tour contains and generates on click", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();
    renderWithProviders(<TourEmptyState canGenerate generating={false} onGenerate={onGenerate} />);

    expect(screen.getByText("No tour yet")).toBeInTheDocument();
    expect(screen.getByText(/architecture overview, critical paths, how to run locally/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Generate tour" }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("disables Generate while generating or when the repo cannot be generated for", () => {
    const { unmount } = renderWithProviders(<TourEmptyState canGenerate generating onGenerate={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Generate tour" })).toBeDisabled();
    unmount();

    renderWithProviders(<TourEmptyState canGenerate={false} generating={false} onGenerate={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Generate tour" })).toBeDisabled();
  });
});
