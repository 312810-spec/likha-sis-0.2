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
});
