import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusChip } from "./StatusChip";

describe("StatusChip", () => {
  it("renders its text with a tone class -- the text itself, not color, carries the meaning", () => {
    render(<StatusChip tone="warning">not yet marked today</StatusChip>);

    const chip = screen.getByText("not yet marked today");
    expect(chip).toHaveClass("status-chip", "status-chip-warning");
  });

  it.each(["neutral", "productive", "success", "warning", "danger"] as const)(
    "applies the %s tone class",
    (tone) => {
      render(<StatusChip tone={tone}>label</StatusChip>);
      expect(screen.getByText("label")).toHaveClass(`status-chip-${tone}`);
    },
  );
});
