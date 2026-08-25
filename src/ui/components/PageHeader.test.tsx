import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  it("renders the title as a heading", async () => {
    render(<PageHeader title="Workspace" />);

    expect(await screen.findByRole("heading", { name: "Workspace" })).toBeInTheDocument();
  });

  it("moves focus to the heading on mount", async () => {
    render(<PageHeader title="Workspace" />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Workspace" })).toHaveFocus());
  });

  it("renders an optional hint below the title", async () => {
    render(<PageHeader title="Workspace" hint={<p>Extra guidance.</p>} />);

    expect(await screen.findByText("Extra guidance.")).toBeInTheDocument();
  });

  it("renders nothing extra when no hint is given", () => {
    const { container } = render(<PageHeader title="Workspace" />);

    expect(container.querySelectorAll(".page-header > *")).toHaveLength(1);
  });
});
