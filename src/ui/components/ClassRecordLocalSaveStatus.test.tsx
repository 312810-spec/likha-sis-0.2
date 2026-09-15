import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClassRecordLocalSaveStatus } from "./ClassRecordLocalSaveStatus";

describe("ClassRecordLocalSaveStatus", () => {
  it("shows only the proven local-save state", () => {
    render(<ClassRecordLocalSaveStatus savedAt="2026-09-15T09:30:00.000Z" />);

    expect(screen.getByRole("status")).toHaveTextContent("Saved on this device");
    expect(screen.getByRole("status")).not.toHaveTextContent(/synced|waiting to sync/i);
  });

  it("does not claim a save while saving, after an error, or without persistence evidence", () => {
    const { rerender } = render(<ClassRecordLocalSaveStatus isSaving />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    rerender(<ClassRecordLocalSaveStatus savedAt="2026-09-15T09:30:00.000Z" hasError />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    rerender(<ClassRecordLocalSaveStatus savedAt="2026-09-15T09:30:00.000Z" isSaving />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
