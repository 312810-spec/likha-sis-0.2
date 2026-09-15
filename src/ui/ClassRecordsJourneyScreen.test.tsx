import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AssessmentApplicationService } from "../application/assessment-service";
import type { ClassRecordApplicationService } from "../application/class-record-service";
import type { ExportApplicationService } from "../application/export-service";
import type { GradingApplicationService } from "../application/grading-service";
import type { LearnerScoreApplicationService } from "../application/learner-score-service";
import type { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ClassRecordsJourneyScreen } from "./ClassRecordsJourneyScreen";
import type { TeacherClassWorkContext } from "./work-context";

const context: TeacherClassWorkContext = {
  teachingAssignmentId: "ta-1",
  subjectName: "Mathematics",
  sectionName: "Mabini",
};

const assignment = {
  id: "ta-1",
  sectionId: "sec-1",
  sectionName: "Mabini",
  schoolYear: "2026-2027",
  subjectId: "sub-1",
  subjectName: "Mathematics",
};

const period = {
  id: "gp-1",
  schoolId: "school-1",
  schoolYear: "2026-2027",
  policyPeriodId: "pp-1",
  label: "Term 1",
  startsOn: "2026-06-01",
  endsOn: "2026-09-30",
  createdAt: "2026-06-01T00:00:00Z",
};

const policy = {
  id: "wp-1",
  name: "Core Subjects",
  sourceCitation: "Synthetic policy fixture",
  isDefault: true,
};

const matchingRecord = {
  id: "cr-1",
  schoolId: "school-1",
  sectionId: "sec-1",
  sectionName: "Mabini",
  subjectId: "sub-1",
  subjectName: "Mathematics",
  gradingPeriodId: "gp-1",
  gradingPeriodLabel: "Term 1",
  schoolYear: "2026-2027",
  weightPolicyId: "wp-1",
  weightPolicyName: "Core Subjects",
  createdAt: "2026-06-01T00:00:00Z",
  itemCount: 2,
  recordedCount: 30,
  totalEligible: 20,
};

function services(options?: { stale?: boolean; records?: unknown[] }) {
  const subjectAttendanceService = {
    listMyAssignments: vi.fn().mockResolvedValue(options?.stale ? [] : [assignment]),
  } as unknown as SubjectAttendanceApplicationService;
  const classRecordService = {
    listClassRecords: vi.fn().mockResolvedValue(options?.records ?? [matchingRecord]),
    listGradingWeightPolicies: vi.fn().mockResolvedValue([policy]),
    createClassRecord: vi.fn().mockResolvedValue({ id: "cr-new" }),
  } as unknown as ClassRecordApplicationService;
  const gradingService = {
    listPeriodsBySchoolYear: vi.fn().mockResolvedValue([period]),
  } as unknown as GradingApplicationService;

  return {
    subjectAttendanceService,
    classRecordService,
    gradingService,
    assessmentService: {} as AssessmentApplicationService,
    learnerScoreService: {} as LearnerScoreApplicationService,
    exportService: {} as ExportApplicationService,
  };
}

function renderJourney(options?: { stale?: boolean; records?: unknown[] }) {
  const serviceSet = services(options);
  const onBackToClass = vi.fn();
  const rendered = render(
    <ClassRecordsJourneyScreen
      classContext={context}
      teacherUserId="teacher-1"
      {...serviceSet}
      onBackToClass={onBackToClass}
    />,
  );
  return { ...rendered, ...serviceSet, onBackToClass };
}

describe("ClassRecordsJourneyScreen", () => {
  it("revalidates the teaching assignment and shows only that class's records", async () => {
    const otherRecord = {
      ...matchingRecord,
      id: "cr-other",
      sectionId: "sec-other",
      sectionName: "Other Section",
    };
    const { subjectAttendanceService } = renderJourney({ records: [matchingRecord, otherRecord] });

    expect(await screen.findByRole("heading", { name: /Class Records — Mathematics — Mabini/ })).toBeInTheDocument();
    expect(screen.getByText("Term 1")).toBeInTheDocument();
    expect(screen.queryByText("Other Section")).not.toBeInTheDocument();
    expect(subjectAttendanceService.listMyAssignments).toHaveBeenCalledWith("teacher-1");
  });

  it("requires explicit term and grading weighting before creating a class record", async () => {
    const user = userEvent.setup();
    const { classRecordService } = renderJourney({ records: [] });

    await screen.findByText("No class records exist for this class yet.");
    const openButton = screen.getByRole("button", { name: "Open class record" });
    expect(openButton).toHaveAttribute("aria-disabled", "true");

    await user.selectOptions(screen.getByLabelText("Term"), "gp-1");
    await user.selectOptions(screen.getByLabelText("DepEd grading weighting"), "wp-1");
    await user.click(openButton);

    expect(classRecordService.createClassRecord).toHaveBeenCalledWith(
      "sec-1",
      "sub-1",
      "gp-1",
      "wp-1",
    );
  });

  it("fails closed when the preserved assignment is no longer owned by the teacher", async () => {
    renderJourney({ stale: true });

    expect(
      await screen.findByText("This class is no longer available in your teaching assignments."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open scoring" })).not.toBeInTheDocument();
  });

  it("returns to the preserved class", async () => {
    const user = userEvent.setup();
    const { onBackToClass } = renderJourney();
    await screen.findByText("Term 1");

    await user.click(screen.getByRole("button", { name: "Back to class" }));
    expect(onBackToClass).toHaveBeenCalledOnce();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderJourney();
    await screen.findByText("Term 1");
    await expectNoAccessibilityViolations(container);
  });
});
