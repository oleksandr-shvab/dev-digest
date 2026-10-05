import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeConvention, renderWithProviders } from "@/test/render";
import { ConventionCard } from "./ConventionCard";

describe("ConventionCard", () => {
  it("shows category, rule, evidence and confidence", () => {
    renderWithProviders(<ConventionCard candidate={makeConvention()} onPatch={vi.fn()} />);
    expect(screen.getByText("Naming")).toBeInTheDocument();
    expect(screen.getByText("Use camelCase for variables.")).toBeInTheDocument();
    expect(screen.getByText("src/a.ts:12")).toBeInTheDocument();
    expect(screen.getByText("const fooBar = 1;")).toBeInTheDocument();
    expect(screen.getByText("80% conf")).toBeInTheDocument();
  });

  it("Accept and Reject call onPatch with the new status", async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    renderWithProviders(<ConventionCard candidate={makeConvention()} onPatch={onPatch} />);
    await user.click(screen.getByRole("button", { name: /^Accept:/ }));
    expect(onPatch).toHaveBeenCalledWith({ status: "accepted" });
    await user.click(screen.getByRole("button", { name: /^Reject:/ }));
    expect(onPatch).toHaveBeenCalledWith({ status: "rejected" });
  });

  it("an accepted candidate shows Undo instead of Accept/Reject/Edit", async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    renderWithProviders(<ConventionCard candidate={makeConvention({ status: "accepted" })} onPatch={onPatch} />);
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Accept:/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Undo:/ }));
    expect(onPatch).toHaveBeenCalledWith({ status: "pending" });
  });

  it("Edit switches to inline editing; Save sends the changed rule/category, Cancel restores", async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    renderWithProviders(<ConventionCard candidate={makeConvention()} onPatch={onPatch} />);

    await user.click(screen.getByRole("button", { name: /^Edit:/ }));
    const textarea = screen.getByRole("textbox");
    await user.clear(textarea);
    await user.type(textarea, "Use PascalCase for classes.");
    await user.selectOptions(screen.getByRole("combobox"), "structure");
    await user.click(screen.getByRole("button", { name: /^Save:/ }));

    expect(onPatch).toHaveBeenCalledWith({ rule: "Use PascalCase for classes.", category: "structure" });
    expect(screen.getByText("Use camelCase for variables.")).toBeInTheDocument(); // props unchanged until the parent refetches

    await user.click(screen.getByRole("button", { name: /^Edit:/ }));
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "Something else.");
    await user.click(screen.getByRole("button", { name: /^Cancel:/ }));
    expect(onPatch).toHaveBeenCalledTimes(1); // Cancel never calls onPatch
    expect(screen.getByText("Use camelCase for variables.")).toBeInTheDocument();
  });

  it("an edited candidate shows the edited tag", () => {
    renderWithProviders(<ConventionCard candidate={makeConvention({ edited: true })} onPatch={vi.fn()} />);
    expect(screen.getByText("edited")).toBeInTheDocument();
  });
});
