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
import type { ClassRecord, ClassRecordDetail, GradingWeightPolicy } from "../domain/class-record";
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
    listClassRecords: vi.fn().mockResolvedValue([]),
    listGradingWeightPolicies: vi.fn().mockResolvedValue(policies),
    createClassRecord: vi.fn().mockResolvedValue(created),
  } as unknown as ClassRecordApplicationService;
}

function renderScreen(overrides?: {
  assignments?: unknown[];
  periods?: GradingPeriod[];
  policies?: GradingWeightPolicy[];
  created?: ClassRecord | null;
  records?: ClassRecordDetail[];
  initialGradingPeriodId?: string;
  initialWeightPolicyId?: string;
}) {
  const onBackToClass = vi.fn();
  const onRecordSelection = vi.fn();
  const subjectAttendance = subjectAttendanceServiceWith(overrides?.assignments ?? [ASSIGNMENT]);
  const grading = gradingServiceWith(overrides?.periods ?? [PERIOD]);
  const classRecord = classRecordServiceWith(
    overrides?.policies ?? [POLICY],
    overrides && "created" in overrides ? overrides.created! : CLASS_RECORD,
  );

  vi.mocked(classRecord.listClassRecords).mockResolvedValue(overrides?.records ?? []);
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
        initialGradingPeriodId={overrides?.initialGradingPeriodId}
        initialWeightPolicyId={overrides?.initialWeightPolicyId}
        onRecordSelection={onRecordSelection}
      />
    </ModeProvider>,
  );
  return { ...rendered, onBackToClass, onRecordSelection, subjectAttendance, grading, classRecord };
}

async function openRecord(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(await screen.findByLabelText("Grading period"), "gp-1");
  await user.selectOptions(screen.getByLabelText("DepEd grading weighting"), "wp-1");
  await user.click(screen.getByRole("button", { name: "Open class record" }));
}

describe("ClassRecordJourneyScreen", () => {
  const savedRecord: ClassRecordDetail = {
    ...CLASS_RECORD,
    weightPolicyId: POLICY.id,
    weightPolicyName: POLICY.name,
    sectionName: ASSIGNMENT.sectionName,
    subjectName: ASSIGNMENT.subjectName,
    gradingPeriodLabel: PERIOD.label,
    schoolYear: PERIOD.schoolYear,
    itemCount: 2,
    recordedCount: 3,
    totalEligible: 5,
  };
  it("reopens the matching saved record without creating a duplicate", async () => {
    const { classRecord } = renderScreen({ records: [savedRecord] });
    await openRecord(userEvent.setup());
    await screen.findByRole("heading", { name: "Class Record Workspace" });
    expect(classRecord.createClassRecord).not.toHaveBeenCalled();
  });
  it("requires an explicit choice when several saved records match", async () => {
    const { classRecord } = renderScreen({
      records: [savedRecord, { ...savedRecord, id: "cr-2", recordedCount: 7 }],
    });
    const user = userEvent.setup();
    await openRecord(user);
    await screen.findByRole("heading", { name: "Choose a saved class record" });
    expect(
      screen.queryByRole("heading", { name: "Class Record Workspace" }),
    ).not.toBeInTheDocument();
    expect(classRecord.createClassRecord).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Record 2/ }));
    await screen.findByRole("heading", { name: "Class Record Workspace" });
  });
  it("does not reopen a record from another assignment or weighting", async () => {
    const { classRecord } = renderScreen({
      records: [
        { ...savedRecord, subjectId: "other" },
        { ...savedRecord, weightPolicyId: "other" },
      ],
    });
    await openRecord(userEvent.setup());
    await screen.findByRole("heading", { name: "Class Record Workspace" });
    expect(classRecord.createClassRecord).toHaveBeenCalledOnce();
  });

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

  it("recalls the grading period and weighting chosen earlier instead of asking again", async () => {
    const user = userEvent.setup();
    const { classRecord } = renderScreen({
      initialGradingPeriodId: "gp-1",
      initialWeightPolicyId: "wp-1",
    });

    const openButton = await screen.findByRole("button", { name: "Open class record" });
    // The choice is already made, so the record is openable in one action
    // rather than after two more selections.
    expect(openButton).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getByLabelText("Grading period")).toHaveValue("gp-1");
    expect(screen.getByLabelText("DepEd grading weighting")).toHaveValue("wp-1");

    await user.click(openButton);

    expect(classRecord.createClassRecord).toHaveBeenCalledWith("sec-1", "subj-1", "gp-1", "wp-1");
    expect(await screen.findByText(/Term 1/)).toBeInTheDocument();
  });

  it("does not recall a grading period the school no longer publishes", async () => {
    renderScreen({ initialGradingPeriodId: "gp-retired", initialWeightPolicyId: "wp-1" });

    const openButton = await screen.findByRole("button", { name: "Open class record" });
    // A retired term falls back to an explicit choice rather than being
    // clamped onto whichever period happens to be first.
    expect(openButton).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByLabelText("Grading period")).toHaveValue("");
  });

  it("reports the chosen period and weighting so the app can recall them", async () => {
    const user = userEvent.setup();
    const { onRecordSelection } = renderScreen();

    await openRecord(user);

    expect(onRecordSelection).toHaveBeenCalledWith({
      gradingPeriodId: "gp-1",
      weightPolicyId: "wp-1",
    });
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
