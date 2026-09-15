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
  label: "Term 1",
  startsOn: "2026-06-01",
  endsOn: "2026-09-30",
  createdAt: "now",
};

const POLICY: GradingWeightPolicy = {
  id: "wp-1",
  name: "Core Weighting",
  sourceCitation: "Synthetic policy fixture",
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

async function openRecord(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(await screen.findByLabelText("Grading period"), "gp-1");
  await user.selectOptions(screen.getByLabelText("DepEd grading weighting"), "wp-1");
  await user.click(screen.getByRole("button", { name: "Open class record" }));
}

describe("ClassRecordJourneyScreen", () => {
  it("requires explicit grading period and weighting before opening", async () => {
    const user = userEvent.setup();
    const { classRecord, grading } = renderScreen();

    const openButton = await screen.findByRole("button", { name: "Open class record" });
    expect(openButton).toHaveAttribute("aria-disabled", "true");
    expect(classRecord.createClassRecord).not.toHaveBeenCalled();
    expect(grading.listPeriodsBySchoolYear).toHaveBeenCalledWith("2026-2027");

    await user.selectOptions(screen.getByLabelText("Grading period"), "gp-1");
    await user.selectOptions(screen.getByLabelText("DepEd grading weighting"), "wp-1");
    await user.click(openButton);

    expect(classRecord.createClassRecord).toHaveBeenCalledWith("sec-1", "subj-1", "gp-1", "wp-1");
    expect(await screen.findByText(/Term 1/)).toBeInTheDocument();
    expect(screen.getByText(/Core Weighting/)).toBeInTheDocument();
  });

  it("continues into Creation Studio and returns to the same class record", async () => {
    const user = userEvent.setup();
    renderScreen();

    await openRecord(user);
    await user.click(await screen.findByRole("button", { name: "Creation Studio" }));

    expect(
      await screen.findByRole("heading", { name: "Creation Studio — Assessment Items" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Grade 8 – Joy — Filipino — Term 1/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to Class Records" }));
    expect(await screen.findByRole("button", { name: "Creation Studio" })).toBeInTheDocument();
    expect(screen.getByText(/Core Weighting/)).toBeInTheDocument();
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

  it("shows a visible error when no grading weighting exists", async () => {
    renderScreen({ policies: [] });
    expect(
      await screen.findByText(
        "No DepEd grading weighting is available yet. Ask your school head to set one up.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a visible error when the selected class record cannot be opened", async () => {
    const user = userEvent.setup();
    renderScreen({ created: null });

    await user.selectOptions(await screen.findByLabelText("Grading period"), "gp-1");
    await user.selectOptions(screen.getByLabelText("DepEd grading weighting"), "wp-1");
    await user.click(screen.getByRole("button", { name: "Open class record" }));

    expect(await screen.findByText(/Could not open this class record/)).toBeInTheDocument();
  });

  it("returns to the class workspace with context intact", async () => {
    const user = userEvent.setup();
    const { onBackToClass } = renderScreen();
    await screen.findByLabelText("Grading period");
    await user.click(screen.getByRole("button", { name: "Back to Filipino — Grade 8 – Joy" }));
    expect(onBackToClass).toHaveBeenCalledTimes(1);
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderScreen();
    await screen.findByLabelText("Grading period");
    await expectNoAccessibilityViolations(container);
  });
});
