import { render, screen, waitFor } from "@testing-library/react";
import { createRef, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { Page } from "./Page";
import { expectNoAccessibilityViolations } from "../../test/a11y";

function renderPage(over: { hint?: ReactNode; actions?: ReactNode } = {}) {
  return render(
    <Page title="Sections" {...over}>
      <p>body content</p>
    </Page>,
  );
}

describe("Page", () => {
  it("renders the title as a level-2 heading and names the region", () => {
    renderPage();
    expect(screen.getByRole("region", { name: "Sections" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Sections" })).toBeInTheDocument();
  });

  it("moves focus to the heading on mount", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2, name: "Sections" })).toHaveFocus(),
    );
  });

  it("uses a caller-supplied headingRef for the h2 and still focuses it on mount", async () => {
    const someRef = createRef<HTMLHeadingElement>();
    render(
      <Page title="X" headingRef={someRef}>
        <p>body content</p>
      </Page>,
    );
    const heading = screen.getByRole("heading", { level: 2, name: "X" });
    expect(someRef.current).toBe(heading);
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it("renders a hint only when given", () => {
    const { rerender } = renderPage();
    expect(screen.queryByText("guidance here")).toBeNull();
    rerender(
      <Page title="Sections" hint={<p className="field-hint">guidance here</p>}>
        <p>body content</p>
      </Page>,
    );
    expect(screen.getByText("guidance here")).toBeInTheDocument();
  });

  it("renders an actions slot in the header", () => {
    renderPage({ actions: <button type="button">New</button> });
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = renderPage({
      hint: <p>hi</p>,
      actions: <button type="button">New</button>,
    });
    await expectNoAccessibilityViolations(container);
  });
});
