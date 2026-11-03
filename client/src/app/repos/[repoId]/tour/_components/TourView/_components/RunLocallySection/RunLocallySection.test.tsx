import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { RunLocallySection } from "./RunLocallySection";

describe("RunLocallySection", () => {
  it("numbers the commands and copies exactly the one whose button is pressed", async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    renderWithProviders(
      <RunLocallySection
        steps={[{ command: "pnpm install" }, { command: "cp .env.example .env # add keys" }, { command: "pnpm dev" }]}
        onCopy={onCopy}
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("cp .env.example .env # add keys")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Copy command 2" }));
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(onCopy).toHaveBeenCalledWith("cp .env.example .env # add keys", "command");
  });
});
