import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders its children as a quiet paragraph", () => {
    render(<EmptyState>No sections created yet.</EmptyState>);

    const paragraph = screen.getByText("No sections created yet.");
    expect(paragraph.tagName).toBe("P");
    expect(paragraph).toHaveClass("empty-state");
  });

  it("supports an intentional title, explanation, and next action", () => {
    render(
      <EmptyState
        title="No classes assigned yet"
        description="Assignments appear here after a school administrator creates them."
        action={<button type="button">Open help</button>}
      />,
    );

    expect(screen.getByRole("heading", { name: "No classes assigned yet" })).toBeInTheDocument();
    expect(screen.getByText(/Assignments appear here/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open help" })).toBeInTheDocument();
  });

  it("can represent a successful zero-state without implying an error", () => {
    const { container } = render(
      <EmptyState
        tone="success"
        title="Everything is synchronized"
        description="No conflicts need review."
      />,
    );
    expect(container.querySelector('[data-tone="success"]')).toBeInTheDocument();
  });
});
