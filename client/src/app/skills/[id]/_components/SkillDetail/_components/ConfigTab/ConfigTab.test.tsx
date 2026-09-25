import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@/lib/api";
import { makeSkill, renderWithProviders } from "@/test/render";
import { ConfigTab } from "./ConfigTab";

// Mock the HTTP boundary only — the real hooks run against it.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), postForm: vi.fn() } };
});
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

import { api } from "@/lib/api";

beforeEach(() => vi.clearAllMocks());

describe("skill ConfigTab", () => {
  it("validates the slug, flags unsaved edits and sends the version message with a content change", async () => {
    const user = userEvent.setup();
    const skill = makeSkill();
    vi.mocked(api.put).mockResolvedValue({ ...skill, body: "# Rule\nCheck every branch.\nAnd loops.", version: 2 });
    const onDirtyChange = vi.fn();
    renderWithProviders(<ConfigTab skill={skill} onDirtyChange={onDirtyChange} />);

    // Clean form: no unsaved chip, no "What changed?", nothing to save.
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("What changed?")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save skill" })).toBeDisabled();

    // Slug validation, inline while typing.
    const name = screen.getByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "Bad Name");
    expect(await screen.findByRole("alert")).toHaveTextContent(/lowercase letters, numbers and single dashes/i);
    await user.clear(name);
    await user.type(name, skill.name);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // Editing the body: unsaved chip + "What changed?" appear.
    await user.type(screen.getByRole("textbox", { name: "Skill body" }), "\nAnd loops.");
    expect(screen.getByText("unsaved")).toBeInTheDocument();
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
    await user.type(screen.getByLabelText("What changed?"), "cover loops");

    await user.click(screen.getByRole("button", { name: "Save skill" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put).toHaveBeenCalledWith("/skills/s1", {
      body: "# Rule\nCheck every branch.\nAnd loops.",
      message: "cover loops",
    });
    expect(await screen.findByText("Saved as v2")).toBeInTheDocument();
  });

  it("shows no message field for a rename and maps a 409 to a field error", async () => {
    const user = userEvent.setup();
    vi.mocked(api.put).mockRejectedValue(new ApiError("Skill name already exists", 409));
    renderWithProviders(<ConfigTab skill={makeSkill()} />);

    const name = screen.getByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "corner-cases");
    expect(screen.queryByLabelText("What changed?")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save skill" }));
    expect(await screen.findByText("Name already used")).toBeInTheDocument();
    expect(api.put).toHaveBeenCalledWith("/skills/s1", { name: "corner-cases" });
  });

  it("creates a new skill from the empty form and redirects to it", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue(makeSkill({ id: "new-1", name: "flaky-tests" }));
    renderWithProviders(<ConfigTab />);

    // No version chip and no "What changed?" on the new form.
    expect(screen.queryByText("v1")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save skill" }));
    expect(await screen.findByText("Name is required.")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();

    await user.type(screen.getByRole("textbox", { name: "Name" }), "flaky-tests");
    await user.type(screen.getByRole("textbox", { name: "Description" }), "Flag flaky tests");
    await user.type(screen.getByRole("textbox", { name: "Skill body" }), "Check sleeps");
    await user.click(screen.getByRole("button", { name: "Save skill" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/skills/new-1"));
    expect(api.post).toHaveBeenCalledWith("/skills", {
      name: "flaky-tests",
      description: "Flag flaky tests",
      type: "custom",
      body: "Check sleeps",
      enabled: true,
    });
  });
});
