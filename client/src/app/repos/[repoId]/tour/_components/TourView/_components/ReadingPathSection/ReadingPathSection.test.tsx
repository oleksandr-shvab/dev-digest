import { describe, it, expect } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { ReadingPathSection } from "./ReadingPathSection";

describe("ReadingPathSection", () => {
  it("lists numbered steps with path and reason, and shows the path alone when the reason is null", () => {
    renderWithProviders(
      <ReadingPathSection
        items={[
          { path: "src/server.ts", reason: "Entry point that wires the app" },
          { path: "src/middleware/auth.ts", reason: null },
          { path: "src/db/schema.ts", reason: "Data model" },
        ]}
      />,
    );

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    const [first, second, third] = rows as [HTMLElement, HTMLElement, HTMLElement];

    expect(within(first).getByText("1")).toBeInTheDocument();
    expect(within(first).getByText("src/server.ts")).toBeInTheDocument();
    expect(within(first).getByText("Entry point that wires the app")).toBeInTheDocument();

    expect(within(second).getByText("2")).toBeInTheDocument();
    expect(within(second).getByText("src/middleware/auth.ts")).toBeInTheDocument();
    expect(second).toHaveTextContent(/^2src\/middleware\/auth\.ts$/);

    expect(within(third).getByText("3")).toBeInTheDocument();
    expect(within(third).getByText("Data model")).toBeInTheDocument();
  });
});
