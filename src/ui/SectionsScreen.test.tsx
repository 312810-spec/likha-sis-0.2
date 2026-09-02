import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ExportApplicationService } from "../application/export-service";
import { LearnerApplicationService } from "../application/learner-service";
import { SectionApplicationService } from "../application/section-service";
import type {
  LearnerRosterExportResult,
  ReportCardExportResult,
  Sf2ExportResult,
  Sf5ExportResult,
  Sf6ExportResult,
} from "../domain/export";
import type { CreateLearnerResult, Learner } from "../domain/learner";
import type { ExportRepository } from "../domain/ports/export-repository";
import type { LearnerRepository } from "../domain/ports/learner-repository";
import type { SectionRepository } from "../domain/ports/section-repository";
import type { Section, SectionMembership, SectionRosterMember } from "../domain/section";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { SectionsScreen } from "./SectionsScreen";

const LEARNER: Learner = {
  id: "l1",
  schoolId: "s1",
  givenName: "Ana",
  familyName: "Santos",
  lrn: null,
  sex: null,
  createdAt: "now",
};

class FakeLearnerRepository implements LearnerRepository {
  constructor(private learners: Learner[] = [LEARNER]) {}

  async list(): Promise<Learner[]> {
    return this.learners;
  }

  async create(): Promise<Learner> {
    throw new Error("not used in this test");
  }

  async createWithDuplicateCheck(): Promise<CreateLearnerResult> {
    throw new Error("not used in this test");
  }

  async updateProfile(): Promise<Learner | null> {
    throw new Error("not used in this test");
  }
}

class FakeSectionRepository implements SectionRepository {
  createCalls: Array<{ schoolYear: string; gradeLevel: string; name: string }> = [];
  enrollCalls: Array<{ sectionId: string; learnerId: string; startsOn: string }> = [];

  constructor(private sections: Section[] = []) {}

  async list(): Promise<Section[]> {
    return this.sections;
  }

  async create(schoolYear: string, gradeLevel: string, name: string): Promise<Section> {
    this.createCalls.push({ schoolYear, gradeLevel, name });
    const section: Section = {
      id: "sec-1",
      schoolId: "s1",
      schoolYear,
      gradeLevel,
      name,
      createdAt: "now",
    };
    this.sections = [...this.sections, section];
    return section;
  }

  async enroll(
    sectionId: string,
    learnerId: string,
    startsOn: string,
  ): Promise<SectionMembership | null> {
    this.enrollCalls.push({ sectionId, learnerId, startsOn });
    return {
      id: "mem-1",
      schoolId: "s1",
      sectionId,
      learnerId,
      startsOn,
      endsOn: null,
      createdAt: "now",
    };
  }

  async transferMembership(): Promise<never> {
    throw new Error("not used in this test");
  }

  async endMembership(): Promise<never> {
    throw new Error("not used in this test");
  }
  async listEnrollableLearners(): Promise<never> {
    throw new Error("not used in this test");
  }
  async enrollMembership(): Promise<never> {
    throw new Error("not used in this test");
  }
  async correctSameDayPlacement(): Promise<never> {
    throw new Error("not used in this test");
  }

  async roster(): Promise<SectionRosterMember[]> {
    return [];
  }
}

class FakeExportRepository implements ExportRepository {
  sf6Calls: string[] = [];
  sf6ToReturn: Sf6ExportResult | null = {
    filePath: "C:\\Documents\\LIKHA-SIS\\SF6_TestSchool_2025-2026.csv",
    disclosure: {
      populatedFields: [
        "School ID",
        "School Name",
        "School Year",
        "Promotion Status Summary",
        "Level of Proficiency Summary",
      ],
      omittedFields: [
        { field: "School Head Certification Signature", reason: "manual ink signature required" },
      ],
    },
  };
  sf6Error: Error | null = null;

  async exportSectionMonthlySf2(): Promise<Sf2ExportResult | null> {
    throw new Error("not used in this test");
  }

  async exportSchoolMonthlyAttendanceSf4(): Promise<
    import("../domain/export").Sf4ExportResult | null
  > {
    throw new Error("not used in this test");
  }

  async exportSectionEosySf5(): Promise<Sf5ExportResult | null> {
    throw new Error("not used in this test");
  }

  async exportSchoolEosySf6(schoolYear: string): Promise<Sf6ExportResult | null> {
    this.sf6Calls.push(schoolYear);
    if (this.sf6Error) throw this.sf6Error;
    return this.sf6ToReturn;
  }

  async exportClassRecordReportCard(): Promise<ReportCardExportResult | null> {
    throw new Error("not used in this test");
  }

  async exportLearnerRoster(): Promise<LearnerRosterExportResult | null> {
    throw new Error("not used in this test");
  }

  revealCalls: string[] = [];
  revealShouldThrow = false;

  async revealExportedFile(filePath: string): Promise<void> {
    this.revealCalls.push(filePath);
    if (this.revealShouldThrow) throw new Error("could not open folder");
  }
}

function renderScreen(
  sections: Section[] = [],
  exportOverrides: Partial<FakeExportRepository> = {},
) {
  const sectionRepo = new FakeSectionRepository(sections);
  const sectionService = new SectionApplicationService(sectionRepo);
  const learnerService = new LearnerApplicationService(new FakeLearnerRepository());
  const exportRepo = new FakeExportRepository();
  Object.assign(exportRepo, exportOverrides);
  const exportService = new ExportApplicationService(exportRepo);
  const openRosterCalls: string[] = [];
  const manageAssignmentsCalls: Array<[string, string]> = [];
  const manageAdviserCalls: Array<[string, string]> = [];
  const result = render(
    <ModeProvider>
      <SectionsScreen
        sectionService={sectionService}
        learnerService={learnerService}
        exportService={exportService}
        onOpenRoster={(sectionId) => openRosterCalls.push(sectionId)}
        onManageAssignments={(sectionId, sectionName) =>
          manageAssignmentsCalls.push([sectionId, sectionName])
        }
        onManageAdviser={(sectionId, sectionName) =>
          manageAdviserCalls.push([sectionId, sectionName])
        }
      />
    </ModeProvider>,
  );
  return {
    ...result,
    sectionRepo,
    exportRepo,
    openRosterCalls,
    manageAssignmentsCalls,
    manageAdviserCalls,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("SectionsScreen", () => {
  it("shows an empty state when there are no sections yet", async () => {
    renderScreen();

    expect(await screen.findByText("No sections created yet.")).toBeInTheDocument();
  });

  it("creates a section and shows it in the list", async () => {
    const user = userEvent.setup();
    const { sectionRepo } = renderScreen();
    await screen.findByText("No sections created yet.");

    await user.type(screen.getByLabelText("School year"), "2025-2026");
    await user.type(screen.getByLabelText("Grade level"), "7");
    await user.type(screen.getByLabelText("Section name"), "Mabini");
    await user.click(screen.getByRole("button", { name: "Create section" }));

    await waitFor(() =>
      expect(screen.getByText(/Mabini — Grade 7 \(2025-2026\)/)).toBeInTheDocument(),
    );
    expect(sectionRepo.createCalls).toEqual([
      { schoolYear: "2025-2026", gradeLevel: "7", name: "Mabini" },
    ]);
  });

  it("enrolls a learner into an existing section", async () => {
    const user = userEvent.setup();
    const section: Section = {
      id: "sec-1",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    const { sectionRepo } = renderScreen([section]);
    await screen.findByText(/Mabini — Grade 7 \(2025-2026\)/);

    await user.selectOptions(screen.getByLabelText("Section"), "sec-1");
    await user.selectOptions(screen.getByLabelText("Learner"), "l1");
    await user.click(screen.getByRole("button", { name: "Enroll learner" }));

    await waitFor(() => expect(screen.getByText("Learner enrolled.")).toBeInTheDocument());
    expect(sectionRepo.enrollCalls).toEqual([
      { sectionId: "sec-1", learnerId: "l1", startsOn: expect.any(String) },
    ]);
  });

  it("opens the roster for a section via its Open roster button", async () => {
    const user = userEvent.setup();
    const section: Section = {
      id: "sec-1",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    const { openRosterCalls } = renderScreen([section]);
    await screen.findByText(/Mabini — Grade 7 \(2025-2026\)/);

    await user.click(screen.getByRole("button", { name: "Open roster for Mabini" }));

    expect(openRosterCalls).toEqual(["sec-1"]);
  });

  it("opens teaching assignments for a section via its Manage assignments button", async () => {
    const user = userEvent.setup();
    const section: Section = {
      id: "sec-1",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    const { manageAssignmentsCalls } = renderScreen([section]);
    await screen.findByText(/Mabini — Grade 7 \(2025-2026\)/);

    await user.click(
      screen.getByRole("button", { name: "Manage teaching assignments for Mabini" }),
    );

    expect(manageAssignmentsCalls).toEqual([["sec-1", "Mabini"]]);
  });

  it("opens the section adviser screen for a section via its Manage adviser button", async () => {
    const user = userEvent.setup();
    const section: Section = {
      id: "sec-1",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    const { manageAdviserCalls } = renderScreen([section]);
    await screen.findByText(/Mabini — Grade 7 \(2025-2026\)/);

    await user.click(screen.getByRole("button", { name: "Manage adviser for Mabini" }));

    expect(manageAdviserCalls).toEqual([["sec-1", "Mabini"]]);
  });

  it("moves focus to the heading on mount", async () => {
    renderScreen();

    await waitFor(() => expect(screen.getByRole("heading", { name: "Sections" })).toHaveFocus());
  });

  it("has no detectable accessibility violations", async () => {
    const section: Section = {
      id: "sec-1",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    const { container } = renderScreen([section]);
    await screen.findByText(/Mabini — Grade 7 \(2025-2026\)/);

    await expectNoAccessibilityViolations(container);
  });

  it("exports SF6 for a selected school year and displays success disclosure", async () => {
    const user = userEvent.setup();
    const section: Section = {
      id: "sec-1",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    const { exportRepo, container } = renderScreen([section]);
    await screen.findByText(/Mabini — Grade 7 \(2025-2026\)/);

    expect(
      screen.getByRole("heading", { name: "End-of-School-Year Summary (SF6)" }),
    ).toBeInTheDocument();

    const exportBtn = screen.getByRole("button", {
      name: "Export SF6 (Promotion & Proficiency Summary)",
    });
    expect(exportBtn).toBeInTheDocument();
    expect(exportBtn).not.toBeDisabled();

    await user.click(exportBtn);

    expect(await screen.findByText(/Saved to/)).toBeInTheDocument();
    expect(
      screen.getByText("C:\\Documents\\LIKHA-SIS\\SF6_TestSchool_2025-2026.csv"),
    ).toBeInTheDocument();

    expect(exportRepo.sf6Calls).toEqual(["2025-2026"]);
    expect(
      screen.getByText(/DepEd SF6 Summarized Report on Promotion and Level of Proficiency/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Table 1:/)).toBeInTheDocument();
    expect(screen.getByText(/Table 2:/)).toBeInTheDocument();
    expect(screen.getByText(/School Head Certification Signature/)).toBeInTheDocument();

    await expectNoAccessibilityViolations(container);
  });

  it("opens the folder for the exported SF6 file when Open folder is clicked", async () => {
    const user = userEvent.setup();
    const section: Section = {
      id: "sec-1",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    const { exportRepo } = renderScreen([section]);
    await screen.findByText(/Mabini — Grade 7 \(2025-2026\)/);
    await user.click(
      screen.getByRole("button", { name: "Export SF6 (Promotion & Proficiency Summary)" }),
    );
    await screen.findByText("C:\\Documents\\LIKHA-SIS\\SF6_TestSchool_2025-2026.csv");

    await user.click(screen.getByRole("button", { name: "Open folder" }));

    await waitFor(() =>
      expect(exportRepo.revealCalls).toEqual([
        "C:\\Documents\\LIKHA-SIS\\SF6_TestSchool_2025-2026.csv",
      ]),
    );
  });

  it("exports SF6 when school year is typed in text input when no sections exist", async () => {
    const user = userEvent.setup();
    const { exportRepo } = renderScreen([]);
    await screen.findByText("No sections created yet.");

    const syInput = screen.getByLabelText("School year for SF6");
    await user.type(syInput, "2024-2025");

    const exportBtn = screen.getByRole("button", {
      name: "Export SF6 (Promotion & Proficiency Summary)",
    });
    await user.click(exportBtn);

    expect(await screen.findByText(/Saved to/)).toBeInTheDocument();
    expect(
      screen.getByText("C:\\Documents\\LIKHA-SIS\\SF6_TestSchool_2025-2026.csv"),
    ).toBeInTheDocument();

    expect(exportRepo.sf6Calls).toEqual(["2024-2025"]);
  });

  it("handles SF6 export error gracefully and displays error alert", async () => {
    const user = userEvent.setup();
    const section: Section = {
      id: "sec-1",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    const { exportRepo } = renderScreen([section]);
    exportRepo.sf6Error = new Error("Failed to consolidate promotion records");
    await screen.findByText(/Mabini — Grade 7 \(2025-2026\)/);

    const exportBtn = screen.getByRole("button", {
      name: "Export SF6 (Promotion & Proficiency Summary)",
    });
    await user.click(exportBtn);

    await waitFor(() =>
      expect(
        screen.getByText(
          "Could not export SF6 — check that you have permission to export school summaries, or that school year records are complete.",
        ),
      ).toBeInTheDocument(),
    );
  });
});
