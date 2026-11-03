import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProjectContextDoc } from "@devdigest/shared";
import { renderWithProviders } from "@/test/render";
import { ContextDocPicker, type ContextDocPickerProps } from "./ContextDocPicker";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), postForm: vi.fn() } };
});
import { api } from "@/lib/api";

const REPO = { id: "r1", full_name: "acme/payments-api" };
const doc = (path: string, type: ProjectContextDoc["type"], tokens: number): ProjectContextDoc => ({
  path,
  type,
  size: tokens * 4,
  tokens,
  used_by: 0,
});
const DOCS = [
  doc("specs/public-api.md", "specs", 120),
  doc("specs/security-baseline.md", "specs", 80),
  doc("docs/webhooks.md", "docs", 60),
];

/** Owns the attached list the way a Context tab does, and records every change. */
function Harness({
  initial = [],
  onChange,
  ...over
}: { initial?: string[]; onChange?: (p: string[]) => void } & Partial<ContextDocPickerProps>) {
  const [attached, setAttached] = React.useState(initial);
  return (
    <ContextDocPicker
      variant="agent"
      title="Project context"
      helper="Toggle to attach."
      badge={`${attached.length} of ${DOCS.length} attached`}
      repo={REPO}
      docs={DOCS}
      isLoading={false}
      isError={false}
      attached={attached}
      onChange={(next) => {
        setAttached(next);
        onChange?.(next);
      }}
      saving={false}
      {...over}
    />
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("ContextDocPicker", () => {
  it("ticks and unticks docs, reporting the new order at once, and shows type and tokens as text", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<Harness onChange={onChange} />);

    expect(screen.getByText("0 of 3 attached")).toBeInTheDocument();
    expect(screen.getByText("≈ 120 tokens")).toBeInTheDocument();
    expect(screen.getAllByText("specs")).toHaveLength(2);

    await user.click(screen.getByRole("checkbox", { name: "Attach specs/security-baseline.md" }));
    await user.click(screen.getByRole("checkbox", { name: "Attach docs/webhooks.md" }));
    expect(onChange).toHaveBeenLastCalledWith(["specs/security-baseline.md", "docs/webhooks.md"]);
    expect(screen.getByText("2 of 3 attached")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Attach specs/security-baseline.md" }));
    expect(onChange).toHaveBeenLastCalledWith(["docs/webhooks.md"]);
    // Attached rows come first.
    const names = screen.getAllByRole("checkbox").map((c) => c.getAttribute("aria-checked"));
    expect(names).toEqual(["true", "false", "false"]);
  });

  it("reorders attached docs with the keyboard and reports the moved order", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const idx = this.parentElement ? Array.from(this.parentElement.children).indexOf(this) : 0;
      const top = idx * 40;
      return { x: 0, y: top, top, left: 0, width: 400, height: 40, right: 400, bottom: top + 40, toJSON: () => ({}) };
    });
    renderWithProviders(<Harness initial={["specs/public-api.md", "specs/security-baseline.md"]} onChange={onChange} />);

    const handle = screen.getByRole("button", { name: "Reorder specs/public-api.md" });
    act(() => handle.focus());
    await user.keyboard(" ");
    await waitFor(() => expect(handle).toHaveAttribute("aria-pressed", "true"));
    await user.keyboard("{ArrowDown}");
    await user.keyboard(" ");

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith(["specs/security-baseline.md", "specs/public-api.md"]);
  });

  it("shows an attached path missing from the repo as 'Not found in <repo>' that can still be detached", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<Harness initial={["specs/removed.md"]} onChange={onChange} />);

    expect(screen.getByText("Not found in acme/payments-api")).toBeInTheDocument();
    // A missing doc has nothing to preview.
    expect(screen.queryByRole("button", { name: "Preview specs/removed.md" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Attach specs/removed.md" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("without a repo shows the notice above the attached paths, which stay detachable", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<Harness initial={["specs/public-api.md"]} repo={null} docs={undefined} onChange={onChange} />);

    expect(screen.getByText("Select a repo to see its docs")).toBeInTheDocument();
    expect(screen.queryByText(/Not found in/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    await user.click(screen.getByRole("checkbox", { name: "Attach specs/public-api.md" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("filters rows by path and turns dragging off while filtering", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness initial={["specs/public-api.md"]} />);

    await user.type(screen.getByRole("textbox", { name: "Filter documents…" }), "webhooks");
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: "Attach docs/webhooks.md" })).toBeInTheDocument();

    await user.clear(screen.getByRole("textbox", { name: "Filter documents…" }));
    await user.type(screen.getByRole("textbox", { name: "Filter documents…" }), "public");
    expect(screen.getByRole("button", { name: "Reorder specs/public-api.md" })).toHaveAttribute("aria-disabled", "true");

    await user.clear(screen.getByRole("textbox", { name: "Filter documents…" }));
    await user.type(screen.getByRole("textbox", { name: "Filter documents…" }), "zzz");
    expect(screen.getByText("No documents match the filter.")).toBeInTheDocument();
  });

  it("renders inherited rows read-only with the skill name, and announces a failed save", () => {
    renderWithProviders(
      <Harness
        initial={["specs/public-api.md"]}
        inherited={[{ path: "docs/webhooks.md", via: "api-rubric" }]}
        saveError="Couldn’t save the attached docs. The change was reverted."
      />,
    );
    // Shown once, as a read-only row — not again as an unattached doc.
    expect(screen.getAllByText("webhooks.md")).toHaveLength(1);
    expect(screen.getByText("via api-rubric")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Attach docs/webhooks.md" })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t save the attached docs");
  });

  it("opens a Preview whose control names the path, renders the doc, and returns focus on close", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({
      path: "specs/public-api.md",
      type: "specs",
      size: 10,
      tokens: 3,
      content: "# Public API\n\nVersioned endpoints.",
    });
    renderWithProviders(<Harness />);

    const trigger = screen.getByRole("button", { name: "Preview specs/public-api.md" });
    await user.click(trigger);
    expect(await screen.findByRole("heading", { name: "Public API" })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/repos/r1/context/docs/content?path=specs%2Fpublic-api.md");

    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("uses an icon button for Preview in the skill variant", () => {
    renderWithProviders(<Harness variant="skill" />);
    const eye = screen.getByRole("button", { name: "Preview specs/public-api.md" });
    expect(eye).not.toHaveTextContent("Preview");
  });
});
