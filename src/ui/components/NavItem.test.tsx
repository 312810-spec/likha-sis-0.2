import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NavItem } from "./NavItem";

describe("NavItem", () => {
  it("renders the label and reflects active state via aria-pressed", () => {
    render(<NavItem label="Workspace" active={true} onClick={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Workspace" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("reflects inactive state via aria-pressed", () => {
    render(<NavItem label="Learners" active={false} onClick={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Learners" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("calls onClick when activated", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<NavItem label="Attendance" active={false} onClick={onClick} />);

    await user.click(screen.getByRole("button", { name: "Attendance" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
