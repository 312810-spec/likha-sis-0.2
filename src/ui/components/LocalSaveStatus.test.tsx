import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LocalSaveStatus } from "./LocalSaveStatus";

describe("LocalSaveStatus", () => {
  it("states only the locally proven save state", () => {
    render(<LocalSaveStatus savedAt="2026-09-15T08:00:00.000Z" />);

    expect(screen.getByRole("status")).toHaveTextContent("Saved on this device");
    expect(screen.getByRole("status")).not.toHaveTextContent(/synced|waiting to sync/i);
  });

  it("does not invent a time when the timestamp is absent or invalid", () => {
    const { rerender } = render(<LocalSaveStatus />);
    expect(screen.getByRole("status")).toHaveTextContent(/^Saved on this device$/);

    rerender(<LocalSaveStatus savedAt="not-a-date" />);
    expect(screen.getByRole("status")).toHaveTextContent(/^Saved on this device$/);
  });
});
