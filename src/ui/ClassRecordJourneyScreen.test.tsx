import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AssessmentApplicationService } from "../application/assessment-service";
import type { ClassRecordApplicationService } from "../application/class-record-service";
import type { ExportApplicationService } from "../application/export-service";
import type { GradingApplicationService } from "../application/grading-service";
import type { LearnerScoreApplicationService } from "../application/learner-score-service";
import type { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import type { GradingPeriod } from "../domain/grading";
import type { ClassRecord, GradingWeightPolicy } from "../domain/class-record";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ClassRecordJourneyScreen } from "./ClassRecordJourneyScreen";
import { ModeProvider } from "./theme/ModeContext";
import type { TeacherClassWorkContext } from "./work-context";

const CONTEXT: TeacherClassWorkContext = {
  teachingAssignmentId: "ta-1",
  subjectName: "Filipino",
  sectionName: "Grade 8 – Joy",
};

const ASSIGNMENT = {
  id: "ta-1",
  sectionId: "sec-1",
  sectionName: "Grade 8 – Joy",
  schoolYear: "2026-2027",
  subjectId: "subj-1",
  subjectName: "Filipino",
};

const PERIOD: GradingPeriod = {
  id: "gp-1",
  schoolId: "s1",
  schoolYear: "2026-2027",
  policyPeriodId: "pp-1",
  label: "1st Quarter",
  startsOn: "2026-06-01",
  endsOn: "2026-08-31",
  createdAt: "now",
};

const POLICY: GradingWeightPolicy = {
  id: "wp-1",
  name: "Core Weighting",
  sourceCitation: "DepEd Order No. 8, s. 2015",
  isDefault: true,
};

const CLASS_RECORD: ClassRecord = {
  id: "cr-1",
  schoolId: "s1",
  sectionId: "sec-1",
  subjectId: "subj-1",
  gradingPeriodId: "gp-1",
  weightPolicyId: "wp-1",
  createdAt: "now",
};

function assessmentService(): AssessmentApplicationService {
  return {
    listItemsByClassRecord: vi.fn().mockResolvedValue([]),
    listCategorySets: vi.fn().mockResolvedValue([]),
  } as unknown as AssessmentApplicationService;
}

function learnerScoreService(): LearnerScoreApplicationService {
  return {} as unknown as LearnerScoreApplicationService;
}

function exportService(): ExportApplicationService {
  return {} as unknown as ExportApplicationService;
}

function subjectAttendanceServiceWith(assignments: unknown[]): SubjectAttendanceApplicationService {
  return {
    listMyAssignments: vi.fn().mockResolvedValue(assignments),
  } as unknown as SubjectAttendanceApplicationService;
}

function gradingServiceWith(periods: GradingPeriod[]): GradingApplicationService {
  return {
    listPeriodsBySchoolYear: vi.fn().mockResolvedValue(periods),
  } as unknown as GradingApplicationService;
}

function classRecordServiceWith(
  policies: GradingWeightPolicy[],
  created: ClassRecord | null,
): ClassRecordApplicationService {
  return {
    listGradingWeightPolicies: vi.fn().mockResolvedValue(policies),
    createClassRecord: vi.fn().mockResolvedValue(created),
  } as unknown as ClassRecordApplicationService;
}

function renderScreen(overrides?: {
  assignments?: unknown[];
  periods?: GradingPeriod[];
  policies?: GradingWeightPolicy[];
  created?: ClassRecord | null;
}) {
  const onBackToClass = vi.fn();
  const subjectAttendance = subjectAttendanceServiceWith(overrides?.assignments ?? [ASSIGNMENT]);
  const grading = gradingServiceWith(overrides?.periods ?? [PERIOD]);
  const classRecord = classRecordServiceWith(
    overrides?.policies ?? [POLICY],
    overrides && "created" in overrides ? overrides.created! : CLASS_RECORD,
  );

  const rendered = render(
    <ModeProvider>
      <ClassRecordJourneyScreen
        teachingAssignmentId="ta-1"
        classContext={CONTEXT}
        teacherUserId="teacher-1"
        subjectAttendanceService={subjectAttendance}
        gradingService={grading}
        classRecordService={classRecord}
        assessmentService={assessmentService()}
        learnerScoreService={learnerScoreService()}
        exportService={exportService()}
        onBackToClass={onBackToClass}
      />
    </ModeProvider>,
  );
  return { ...rendered, onBackToClass, subjectAttendance, grading, classRecord };
}

describe("ClassRecordJourneyScreen", () => {
  it("finds-or-creates the class record from the teaching assignment and opens the workspace", async () => {
    const { classRecord, grading } = renderScreen();

    expect(await screen.findByText(/1st Quarter/)).toBeInTheDocument();
    expect(screen.getByText(/Core Weighting/)).toBeInTheDocument();
    expect(grading.listPeriodsBySchoolYear).toHaveBeenCalledWith("2026-2027");
    expect(classRecord.createClassRecord).toHaveBeenCalledWith("sec-1", "subj-1", "gp-1", "wp-1");
  });

  it("shows a visible error when the assignment is no longer authorized", async () => {
    renderScreen({ assignments: [] });
    expect(await screen.findByText("This class is no longer assigned to you.")).toBeInTheDocument();
  });

  it("shows a visible error when no grading period exists for the school year", async () => {
    renderScreen({ periods: [] });
    expect(
      await screen.findByText(
        "No grading period has been set up yet for this class's school year.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a visible error when no default weight policy exists", async () => {
    renderScreen({ policies: [] });
    expect(
      await screen.findByText(
        "No DepEd grading weighting is available yet. Ask your school head to set one up.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a visible error when the class record cannot be opened (cross-school-year/ownership mismatch)", async () => {
    renderScreen({ created: null });
    expect(await screen.findByText(/Could not open this class record/)).toBeInTheDocument();
  });

  it("retries resolution from the error state", async () => {
    const user = userEvent.setup();
    const { classRecord } = renderScreen({ created: null });
    await screen.findByText(/Could not open this class record/);
    (classRecord.createClassRecord as ReturnType<typeof vi.fn>).mockResolvedValueOnce(CLASS_RECORD);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(/1st Quarter/)).toBeInTheDocument();
  });

  it("returns to the class workspace with context intact", async () => {
    const user = userEvent.setup();
    const { onBackToClass } = renderScreen();
    await screen.findByText(/1st Quarter/);
    await user.click(screen.getByRole("button", { name: "Back to Filipino — Grade 8 – Joy" }));
    expect(onBackToClass).toHaveBeenCalledTimes(1);
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderScreen();
    await screen.findByText(/1st Quarter/);
    await expectNoAccessibilityViolations(container);
  });
});
