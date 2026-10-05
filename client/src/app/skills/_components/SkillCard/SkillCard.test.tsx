import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeSkill, renderWithProviders } from "@/test/render";
import { SkillCard } from "./SkillCard";

describe("SkillCard", () => {
  it("formats the stats footer and shows a dash for null rates", () => {
    const { rerender } = renderWithProviders(
      <SkillCard skill={makeSkill({ stats: { used_by: 3, pull_rate: 0.62, accept_rate: 0.8 } })} />,
    );
    expect(screen.getByText("uncovered-branches")).toBeInTheDocument();
    expect(screen.getByText("Flag branches without tests")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
    expect(screen.getByText(/3 agents · 62% pull ·/)).toBeInTheDocument();
    expect(screen.getByText("80% accept")).toBeInTheDocument();

    rerender(<SkillCard skill={makeSkill({ stats: { used_by: 1, pull_rate: null, accept_rate: null } })} />);
    expect(screen.getByText(/1 agent · — pull ·/)).toBeInTheDocument();
    expect(screen.getByText("— accept")).toBeInTheDocument();
  });

  it("toggles without selecting the card, and renders muted when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onToggle = vi.fn();
    renderWithProviders(<SkillCard skill={makeSkill({ enabled: false })} onClick={onClick} onToggle={onToggle} />);

    const card = screen.getByRole("button", { name: /uncovered-branches/ });
    expect(card).toHaveStyle({ opacity: "0.6" });

    await user.click(screen.getByRole("switch", { name: "Enable uncovered-branches" }));
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(onClick).not.toHaveBeenCalled();

    await user.click(card);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
