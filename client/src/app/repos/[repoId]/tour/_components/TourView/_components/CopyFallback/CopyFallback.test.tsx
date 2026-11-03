import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { CopyFallback } from "./CopyFallback";

describe("CopyFallback", () => {
  it("shows the text in a read-only, focused and selected field", () => {
    renderWithProviders(<CopyFallback text="pnpm install && pnpm dev" onDismiss={vi.fn()} />);

    const field = screen.getByRole("textbox", { name: "Copy this text manually" }) as HTMLInputElement;
    expect(field).toHaveValue("pnpm install && pnpm dev");
    expect(field).toHaveAttribute("readonly");
    expect(field).toHaveFocus();
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe("pnpm install && pnpm dev".length);
  });

  it("dismisses through the Close button and through Escape", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    renderWithProviders(<CopyFallback text="some text" onDismiss={onDismiss} />);

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    screen.getByRole("textbox").focus();
    await user.keyboard("{Escape}");
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });
});
