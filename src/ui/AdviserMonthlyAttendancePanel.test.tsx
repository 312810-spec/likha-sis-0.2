import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdviserMonthlyAttendanceApplicationService } from "../application/adviser-monthly-attendance-service";
import type { AdviserMonthlyAttendanceRepository } from "../domain/ports/adviser-monthly-attendance-repository";
import { AdviserMonthlyAttendancePanel } from "./AdviserMonthlyAttendancePanel";

function makeRepository(): AdviserMonthlyAttendanceRepository {
  return {
    summary: vi.fn().mockResolvedValue({
      year: 2026,
      month: 8,
      schoolDays: [3, 4],
      learners: [
        {
          learnerId: "learner-1",
          givenName: "Ana",
          familyName: "Cruz",
          days: ["present", "absent"],
          presentCount: 1,
          absentCount: 1,
          tardyCount: 0,
        },
      ],
    }),
    exportSf2: vi.fn().mockResolvedValue({
      filePath: "synthetic-sf2.csv",
      disclosure: {
        populatedFields: ["attendance"],
        omittedFields: [{ field: "layout", reason: "Template layout is not verified." }],
      },
    }),
  };
}

describe("AdviserMonthlyAttendancePanel", () => {
  it("shows the monthly grid and its SF2-inspired limitation", async () => {
    const repo = makeRepository();
    render(
      <AdviserMonthlyAttendancePanel
        service={new AdviserMonthlyAttendanceApplicationService(repo)}
        sectionId="sec-1"
        asOfDate="2026-08-29"
        sectionName="Mabini"
      />,
    );
    expect(await screen.findByText("Ana Cruz")).toBeInTheDocument();
    await waitFor(() => expect(repo.summary).toHaveBeenCalledWith("sec-1", 2026, 8));
    expect(screen.getByText(/not a submission-ready official SF2/i)).toBeInTheDocument();
  });

  it("shows the disclosure returned with an export", async () => {
    const user = userEvent.setup();
    const repo = makeRepository();
    render(
      <AdviserMonthlyAttendancePanel
        service={new AdviserMonthlyAttendanceApplicationService(repo)}
        sectionId="sec-1"
        asOfDate="2026-08-29"
        sectionName="Mabini"
      />,
    );
    await screen.findByText("Ana Cruz");
    await user.click(screen.getByRole("button", { name: "Export SF2-inspired CSV" }));
    await waitFor(() => expect(repo.exportSf2).toHaveBeenCalledWith("sec-1", 2026, 8));
    expect(await screen.findByText(/synthetic-sf2.csv/)).toBeInTheDocument();
    expect(screen.getByText(/Template layout is not verified/)).toBeInTheDocument();
  });
});
