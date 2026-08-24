import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttendanceApplicationService } from "../application/attendance-service";
import { ExportApplicationService } from "../application/export-service";
import { SectionApplicationService } from "../application/section-service";
import type {
  AttendanceRecord,
  AttendanceRosterEntry,
  AttendanceStatus,
  MonthlyAttendanceReport,
} from "../domain/attendance";
import type {
  LearnerRosterExportResult,
  ReportCardExportResult,
  Sf2ExportResult,
} from "../domain/export";
import type { AttendanceRepository } from "../domain/ports/attendance-repository";
import type { ExportRepository } from "../domain/ports/export-repository";
import type { SectionRepository } from "../domain/ports/section-repository";
import type { Section, SectionMembership, SectionRosterMember } from "../domain/section";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { MonthlySummaryScreen } from "./MonthlySummaryScreen";

const SECTION: Section = {
  id: "sec-1",
  schoolId: "s1",
  schoolYear: "2025-2026",
  gradeLevel: "7",
  name: "Mabini",
  createdAt: "now",
};

class FakeAttendanceRepository implements AttendanceRepository {
  monthlySummaryCalls: Array<{ sectionId: string; year: number; month: number }> = [];

  constructor(private report: MonthlyAttendanceReport) {}

  async rosterForDate(): Promise<AttendanceRosterEntry[]> {
    return [];
  }

  async record(): Promise<AttendanceRecord | null> {
    return null;
  }

  async bulkMarkPresent(): Promise<AttendanceRosterEntry[]> {
    return [];
  }

  async monthlySummary(
    sectionId: string,
    year: number,
    month: number,
  ): Promise<MonthlyAttendanceReport> {
    this.monthlySummaryCalls.push({ sectionId, year, month });
    return this.report;
  }
}

class FakeSectionRepository implements SectionRepository {
  constructor(private sections: Section[] = [SECTION]) {}

  async list(): Promise<Section[]> {
    return this.sections;
  }

  async create(): Promise<Section> {
    throw new Error("not used in this test");
  }

  async enroll(): Promise<SectionMembership | null> {
    throw new Error("not used in this test");
  }

  async roster(): Promise<SectionRosterMember[]> {
    return [];
  }
}

class FakeExportRepository implements ExportRepository {
  calls: Array<{ sectionId: string; year: number; month: number }> = [];
  resultToReturn: Sf2ExportResult | null = {
    filePath: "C:\\Users\\teacher\\Documents\\LIKHA-SIS\\SF2_Mabini_2026-08.csv",
    disclosure: {
      populatedFields: ["School Name"],
      omittedFields: [{ field: "School ID (EBEIS)", reason: "not tracked by this app" }],
    },
  };

  async exportSectionMonthlySf2(
    sectionId: string,
    year: number,
    month: number,
  ): Promise<Sf2ExportResult | null> {
    this.calls.push({ sectionId, year, month });
    return this.resultToReturn;
  }

  async exportClassRecordReportCard(): Promise<ReportCardExportResult | null> {
    throw new Error("not used in this test");
  }

  async exportLearnerRoster(): Promise<LearnerRosterExportResult | null> {
    throw new Error("not used in this test");
  }
}

const EMPTY_REPORT: MonthlyAttendanceReport = {
  year: 2026,
  month: 8,
  schoolDays: [],
  learners: [],
};

function reportWith(status: AttendanceStatus | null): MonthlyAttendanceReport {
  return {
    year: 2026,
    month: 8,
    schoolDays: [3, 4, 5],
    learners: [
      {
        learnerId: "l1",
        givenName: "Ana",
        familyName: "Santos",
        days: [status, null, null],
        presentCount: status === "present" ? 1 : 0,
        absentCount: status === "absent" ? 1 : 0,
        tardyCount: status === "tardy" ? 1 : 0,
      },
    ],
  };
}

function renderScreen(
  report: MonthlyAttendanceReport = EMPTY_REPORT,
  sections: Section[] = [SECTION],
) {
  const repo = new FakeAttendanceRepository(report);
  const service = new AttendanceApplicationService(repo, () => new Date("2026-08-24"));
  const sectionService = new SectionApplicationService(new FakeSectionRepository(sections));
  const exportRepo = new FakeExportRepository();
  const exportService = new ExportApplicationService(exportRepo);
  const result = render(
    <ModeProvider>
      <MonthlySummaryScreen
        attendanceService={service}
        sectionService={sectionService}
        exportService={exportService}
        schoolName="Rizal Elementary"
      />
    </ModeProvider>,
  );
  return { ...result, repo, exportRepo };
}

beforeEach(() => {
  window.localStorage.clear();
  // This file injects a fixed "now" into AttendanceApplicationService
  // below, but MonthlySummaryScreen.tsx's own month/year defaults read
  // the real system clock independently — without freezing it too, the
  // two drift apart at the next month boundary even though same-month
  // drift (e.g. one day later) stays invisible. See
  // docs/learning/ERROR-PATTERNS.md and AttendanceScreen.test.tsx's
  // identical fix for the concrete failure this silently causes.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-08-24T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("MonthlySummaryScreen", () => {
  it("shows a message when there are no sections yet", async () => {
    renderScreen(EMPTY_REPORT, []);

    expect(await screen.findByText(/no sections created yet/i)).toBeInTheDocument();
  });

  it("shows an empty state when there are no learners yet in the selected section", async () => {
    renderScreen();

    expect(
      await screen.findByText("No learners enrolled in this section yet."),
    ).toBeInTheDocument();
  });

  it("shows the school name, section, month, and year in the table caption", async () => {
    renderScreen(reportWith("present"));

    expect(await screen.findByText("Rizal Elementary — Mabini — August 2026")).toBeInTheDocument();
  });

  it("shows a marked day's status abbreviation with a full-text accessible label", async () => {
    renderScreen(reportWith("present"));
    await screen.findByText("Ana Santos");

    expect(screen.getByLabelText("August 3: Present")).toHaveTextContent("P");
  });

  it("shows the SF2-inspired disclaimer", async () => {
    renderScreen();

    expect(screen.getByText(/verified, submission-ready reproduction/i)).toBeInTheDocument();
  });

  it("requests a new summary when the month changes", async () => {
    const { repo } = renderScreen(reportWith("present"));
    await screen.findByText("Ana Santos");

    fireEvent.change(screen.getByLabelText("Month"), { target: { value: "2026-07" } });

    await waitFor(() =>
      expect(repo.monthlySummaryCalls).toEqual([
        { sectionId: "sec-1", year: 2026, month: 8 },
        { sectionId: "sec-1", year: 2026, month: 7 },
      ]),
    );
  });

  it("moves focus to the heading on mount", async () => {
    renderScreen();

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Monthly Attendance Summary" })).toHaveFocus(),
    );
  });

  it("shows a field hint only in guided mode", async () => {
    window.localStorage.setItem("likha-sis:teacher-mode", "guided");
    renderScreen();
    await screen.findByText("No learners enrolled in this section yet.");

    expect(screen.getByText(/pick a section and month/i)).toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderScreen(reportWith("tardy"));
    await waitFor(() => screen.getByText("Ana Santos"));

    await expectNoAccessibilityViolations(container);
  });

  it("exports and shows the saved path plus the omitted-field disclosure", async () => {
    const user = userEvent.setup();
    const { exportRepo } = renderScreen(reportWith("present"));
    await screen.findByText("Ana Santos");

    await user.click(screen.getByRole("button", { name: "Export SF2 (CSV)" }));

    await waitFor(() =>
      expect(
        screen.getByText("C:\\Users\\teacher\\Documents\\LIKHA-SIS\\SF2_Mabini_2026-08.csv"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("School ID (EBEIS)")).toBeInTheDocument();
    expect(screen.getByText(/not tracked by this app/)).toBeInTheDocument();
    expect(exportRepo.calls).toEqual([{ sectionId: "sec-1", year: 2026, month: 8 }]);
  });

  it("shows an error when the section could not be resolved for export", async () => {
    const user = userEvent.setup();
    const { exportRepo } = renderScreen(reportWith("present"));
    exportRepo.resultToReturn = null;
    await screen.findByText("Ana Santos");

    await user.click(screen.getByRole("button", { name: "Export SF2 (CSV)" }));

    await waitFor(() => expect(screen.getByText(/could not export/i)).toBeInTheDocument());
  });

  it("disables the export button while there is no report to export", async () => {
    renderScreen();
    await screen.findByText("No learners enrolled in this section yet.");

    expect(screen.getByRole("button", { name: "Export SF2 (CSV)" })).toBeDisabled();
  });
});
