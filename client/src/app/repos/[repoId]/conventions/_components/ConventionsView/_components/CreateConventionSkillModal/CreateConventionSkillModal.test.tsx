import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ConventionSkillDraft } from "@devdigest/shared";
import { makeAgent, makeSkill, renderWithProviders } from "@/test/render";
import { CreateConventionSkillModal } from "./CreateConventionSkillModal";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn(), postForm: vi.fn() } };
});
import { api } from "@/lib/api";
import { ApiError } from "@/lib/api";

const DRAFT: ConventionSkillDraft = {
  name: "repo-conventions",
  description: "Flag code that breaks this repo's extracted conventions.",
  type: "convention",
  body: "## Naming\n- Use camelCase.",
  evidence_files: ["src/a.ts"],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockResolvedValue([makeAgent({ id: "ag1", name: "API Contract Reviewer" })]);
});

describe("CreateConventionSkillModal", () => {
  it("loads the draft on open and populates name/description/body", async () => {
    vi.mocked(api.post).mockResolvedValueOnce(DRAFT);
    renderWithProviders(<CreateConventionSkillModal repoId="r1" candidateIds={["c1"]} onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(await screen.findByDisplayValue("repo-conventions")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/repos/r1/conventions/skill-draft", { candidate_ids: ["c1"] });
    expect(screen.getByDisplayValue("Flag code that breaks this repo's extracted conventions.")).toBeInTheDocument();
  });

  it("editing body/metadata and linking an agent sends them all on Create", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValueOnce(DRAFT).mockResolvedValueOnce(makeSkill({ id: "new-skill", name: "repo-conventions" }));
    const onSaved = vi.fn();
    renderWithProviders(<CreateConventionSkillModal repoId="r1" candidateIds={["c1", "c2"]} onClose={vi.fn()} onSaved={onSaved} />);

    await screen.findByDisplayValue("repo-conventions");
    await waitFor(() => expect(screen.getByRole("button", { name: "Create" })).toBeEnabled());

    const description = screen.getByRole("textbox", { name: "Description" });
    await user.clear(description);
    await user.type(description, "Edited description.");
    await user.click(screen.getByRole("checkbox", { name: "API Contract Reviewer" }));
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.post).toHaveBeenLastCalledWith("/repos/r1/conventions/skill", {
      name: "repo-conventions",
      description: "Edited description.",
      type: "convention",
      body: DRAFT.body,
      evidence_files: DRAFT.evidence_files,
      candidate_ids: ["c1", "c2"],
      agent_ids: ["ag1"],
    });
  });

  it("Create is disabled while the name is invalid", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValueOnce(DRAFT);
    renderWithProviders(<CreateConventionSkillModal repoId="r1" candidateIds={["c1"]} onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByDisplayValue("repo-conventions");
    await waitFor(() => expect(screen.getByRole("button", { name: "Create" })).toBeEnabled());

    const name = screen.getByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "Not A Slug");
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
    expect(screen.getByText("Use lowercase letters, digits and hyphens only.")).toBeInTheDocument();
  });

  it("a 409 maps to the Name field and blocks Create", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post)
      .mockResolvedValueOnce(DRAFT)
      .mockRejectedValueOnce(new ApiError("Conflict", 409, "conflict"));
    renderWithProviders(<CreateConventionSkillModal repoId="r1" candidateIds={["c1"]} onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByDisplayValue("repo-conventions");
    await waitFor(() => expect(screen.getByRole("button", { name: "Create" })).toBeEnabled());

    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText("Name already used")).toBeInTheDocument();
  });

  it("Cancel posts nothing", async () => {
    vi.mocked(api.post).mockResolvedValueOnce(DRAFT);
    const onClose = vi.fn();
    renderWithProviders(<CreateConventionSkillModal repoId="r1" candidateIds={["c1"]} onClose={onClose} onSaved={vi.fn()} />);
    await screen.findByDisplayValue("repo-conventions");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(api.post).toHaveBeenCalledTimes(1); // only the draft call — never /repos/:id/conventions/skill
  });
});
