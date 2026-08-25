import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAccessibilityViolations } from "../../test/a11y";
import { Alert } from "./Alert";

describe("Alert", () => {
  it("renders error tone with role=alert", () => {
    render(<Alert tone="error">Something went wrong.</Alert>);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Something went wrong.");
    expect(alert).toHaveClass("alert-error");
  });

  it("renders warning tone with role=alert", () => {
    render(<Alert tone="warning">Careful.</Alert>);

    expect(screen.getByRole("alert")).toHaveClass("alert-warning");
  });

  it("renders success tone with role=status", () => {
    render(<Alert tone="success">Saved.</Alert>);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Saved.");
    expect(status).toHaveClass("alert-success");
  });

  it("renders info tone with role=status", () => {
    render(<Alert tone="info">FYI.</Alert>);

    expect(screen.getByRole("status")).toHaveClass("alert-info");
  });

  it("applies the inline layout class only when requested", () => {
    const { rerender, container } = render(<Alert tone="warning">Message</Alert>);
    expect(container.querySelector(".alert-inline")).not.toBeInTheDocument();

    rerender(
      <Alert tone="warning" inline>
        Message
      </Alert>,
    );
    expect(container.querySelector(".alert-inline")).toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<Alert tone="error">Something went wrong.</Alert>);

    await expectNoAccessibilityViolations(container);
  });
});
