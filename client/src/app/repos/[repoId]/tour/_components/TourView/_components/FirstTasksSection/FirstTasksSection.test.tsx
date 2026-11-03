import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { FirstTasksSection } from "./FirstTasksSection";

describe("FirstTasksSection", () => {
  it("renders each task with title, description and paths", () => {
    renderWithProviders(
      <FirstTasksSection
        tasks={[
          {
            title: "Add a request-id header to every response",
            description: "Set x-request-id in the server hook.",
            paths: ["src/server.ts", "src/middleware/auth.ts"],
          },
          { title: "Cover the auth middleware", description: "Add a missing-token test.", paths: ["src/middleware/auth.ts"] },
        ]}
      />,
    );

    expect(screen.getByText("Add a request-id header to every response")).toBeInTheDocument();
    expect(screen.getByText("Set x-request-id in the server hook.")).toBeInTheDocument();
    expect(screen.getByText("src/server.ts")).toBeInTheDocument();
    expect(screen.getByText("Cover the auth middleware")).toBeInTheDocument();
    expect(screen.getAllByText("src/middleware/auth.ts")).toHaveLength(2);
  });

  it("says no task could be grounded when the list is empty", () => {
    renderWithProviders(<FirstTasksSection tasks={[]} />);
    expect(screen.getByText("No starter tasks could be grounded in this repo — try Regenerate")).toBeInTheDocument();
  });
});
