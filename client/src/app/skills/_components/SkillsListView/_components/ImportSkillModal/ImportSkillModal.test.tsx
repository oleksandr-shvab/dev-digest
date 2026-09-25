import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SkillImportDraft } from "@devdigest/shared";
import { makeSkill, renderWithProviders } from "@/test/render";
import { ImportSkillModal } from "./ImportSkillModal";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), postForm: vi.fn() } };
});
import { api } from "@/lib/api";

const DRAFT: SkillImportDraft = {
  name: "flaky-tests",
  description: "Flag flaky tests",
  type: "custom",
  body: "# Flaky tests\nAvoid sleeps.",
  tokens: 7,
  file: { name: "flaky-tests.zip", kind: "zip" },
  ignored: [{ path: "scripts/run.sh", reason: "script" }],
  warnings: ["name was normalized"],
  name_conflict: false,
};
const zip = () => new File(["zip"], "flaky-tests.zip", { type: "application/zip" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockResolvedValue([makeSkill({ name: "corner-cases", id: "s2" })]);
});

describe("ImportSkillModal", () => {
  it("previews before saving: Save is disabled until the draft loads, ignored files and the trust banner show, then Save posts", async () => {
    const user = userEvent.setup();
    vi.mocked(api.postForm).mockResolvedValue(DRAFT);
    vi.mocked(api.post).mockResolvedValue(makeSkill({ id: "new-1", name: "flaky-tests" }));
    const onSaved = vi.fn();
    renderWithProviders(<ImportSkillModal onClose={vi.fn()} onSaved={onSaved} />);

    expect(screen.getByText(/Accepts \.md and \.zip · max 1 MB/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save skill" })).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();

    await user.upload(screen.getByLabelText("Skill file"), zip());
    expect(await screen.findByText("scripts/run.sh — script, not imported")).toBeInTheDocument();
    expect(api.postForm).toHaveBeenCalledWith("/skills/import/preview", expect.any(FormData));
    expect(screen.getByRole("note")).toHaveTextContent(/written by someone else.*never run or stored/);
    expect(screen.getByText("name was normalized")).toBeInTheDocument();
    expect(screen.getByText("~7 tokens")).toBeInTheDocument();
    // Nothing is persisted by the preview.
    expect(api.post).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save skill" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith("/skills", {
      name: "flaky-tests",
      description: "Flag flaky tests",
      type: "custom",
      body: "# Flaky tests\nAvoid sleeps.",
      source: "imported_file",
      message: "Imported from flaky-tests.zip",
    });
  });

  it("blocks Save on a name conflict until renamed, and Cancel posts nothing", async () => {
    const user = userEvent.setup();
    vi.mocked(api.postForm).mockResolvedValue({ ...DRAFT, name_conflict: true });
    const onClose = vi.fn();
    renderWithProviders(<ImportSkillModal onClose={onClose} onSaved={vi.fn()} />);

    await user.upload(screen.getByLabelText("Skill file"), zip());
    expect(await screen.findByText(/A skill named “flaky-tests” already exists/)).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Save skill" });
    expect(save).toBeDisabled();

    // Renaming to a name that is also taken stays blocked; a free name unblocks.
    const name = screen.getByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "corner-cases");
    expect(save).toBeDisabled();
    await user.clear(name);
    await user.type(name, "flaky-tests-2");
    expect(save).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("rejects files that are not .md or .zip without calling the API", async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderWithProviders(<ImportSkillModal onClose={vi.fn()} onSaved={vi.fn()} />);
    await user.upload(screen.getByLabelText("Skill file"), new File(["x"], "notes.txt"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Only .md and .zip files can be imported.");
    expect(api.postForm).not.toHaveBeenCalled();
  });
});
