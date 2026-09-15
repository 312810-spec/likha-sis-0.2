import { useEffect, useRef, useState } from "react";
import type { AssessmentApplicationService } from "../application/assessment-service";
import type { ClassRecordApplicationService } from "../application/class-record-service";
import type { ExportApplicationService } from "../application/export-service";
import type { GradingApplicationService } from "../application/grading-service";
import type { LearnerScoreApplicationService } from "../application/learner-score-service";
import type { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import { ValidationError } from "../domain/errors";
import { Alert } from "./components/Alert";
import { Loading } from "./components/Loading";
import { Page } from "./components/Page";
import { ClassRecordWorkspace } from "./ClassRecordWorkspace";
import type { TeacherClassWorkContext } from "./work-context";

interface ClassRecordJourneyScreenProps {
  teachingAssignmentId: string;
  classContext: TeacherClassWorkContext;
  teacherUserId: string;
  subjectAttendanceService: SubjectAttendanceApplicationService;
  gradingService: GradingApplicationService;
  classRecordService: ClassRecordApplicationService;
  assessmentService: AssessmentApplicationService;
  learnerScoreService: LearnerScoreApplicationService;
  exportService: ExportApplicationService;
  onBackToClass: () => void | Promise<void>;
}

type Resolution =
  | { status: "loading" }
  | {
      status: "ready";
      classRecordId: string;
      gradingPeriodLabel: string;
      weightPolicyName: string;
    }
  | { status: "error"; message: string };

/**
 * Golden Journey adapter (GJ-6, first slice): opens the class record for
 * the preserved class context's teaching assignment -- its section,
 * subject, and the section's current grading period -- without asking
 * the teacher to pick from dropdowns again.
 *
 * Resolution is entirely trusted-service driven, never guessed in the
 * UI: the teaching assignment is revalidated through
 * `SubjectAttendanceApplicationService.listMyAssignments` -- the same
 * call the app already uses to revalidate a preserved class context (see
 * `docs/adr/0060-golden-journey-app-class-context.md`) -- and the class
 * record itself is opened through `ClassRecordApplicationService
 * .createClassRecord`'s existing find-or-create semantics, which keeps
 * every grading-policy and cross-school-year/ownership decision a
 * domain/service concern. This screen never computes or guesses a
 * grade; it only supplies resolved identifiers to the existing
 * `ClassRecordWorkspace`.
 *
 * A grading period or weight policy that cannot be resolved, or a class
 * record that `createClassRecord` refuses, is shown as a visible,
 * retryable error -- never a silent failure or a guessed fallback.
 */
export function ClassRecordJourneyScreen({
  teachingAssignmentId,
  classContext,
  teacherUserId,
  subjectAttendanceService,
  gradingService,
  classRecordService,
  assessmentService,
  learnerScoreService,
  exportService,
  onBackToClass,
}: ClassRecordJourneyScreenProps) {
  const [resolution, setResolution] = useState<Resolution>({ status: "loading" });
  const requestRef = useRef(0);

  function resolve() {
    const requestId = ++requestRef.current;
    setResolution({ status: "loading" });

    async function run(): Promise<Resolution> {
      const assignments = await subjectAttendanceService.listMyAssignments(teacherUserId);
      const assignment = assignments.find((candidate) => candidate.id === teachingAssignmentId);
      if (!assignment) {
        return { status: "error", message: "This class is no longer assigned to you." };
      }

      const periods = await gradingService.listPeriodsBySchoolYear(assignment.schoolYear);
      const currentPeriod = periods[0];
      if (!currentPeriod) {
        return {
          status: "error",
          message: "No grading period has been set up yet for this class's school year.",
        };
      }

      const policies = await classRecordService.listGradingWeightPolicies();
      const defaultPolicy = policies.find((policy) => policy.isDefault) ?? policies[0];
      if (!defaultPolicy) {
        return {
          status: "error",
          message:
            "No DepEd grading weighting is available yet. Ask your school head to set one up.",
        };
      }

      const created = await classRecordService.createClassRecord(
        assignment.sectionId,
        assignment.subjectId,
        currentPeriod.id,
        defaultPolicy.id,
      );
      if (!created) {
        return {
          status: "error",
          message:
            "Could not open this class record — the section, subject, grading period, and grading weighting must belong to your school and share the same school year.",
        };
      }

      return {
        status: "ready",
        classRecordId: created.id,
        gradingPeriodLabel: currentPeriod.label,
        weightPolicyName: defaultPolicy.name,
      };
    }

    run()
      .then((result) => {
        if (requestRef.current !== requestId) return;
        setResolution(result);
      })
      .catch((err) => {
        if (requestRef.current !== requestId) return;
        setResolution({
          status: "error",
          message:
            err instanceof ValidationError ? err.message : "Could not open this class record.",
        });
      });
  }

  useEffect(() => {
    // Same initial external-service synchronization pattern used by
    // MyDayScreen/ClassLearnersPanel.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    resolve();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    teachingAssignmentId,
    teacherUserId,
    subjectAttendanceService,
    gradingService,
    classRecordService,
  ]);

  const backLabel = `Back to ${classContext.subjectName} — ${classContext.sectionName}`;
  const backButton = (
    <button type="button" onClick={() => void onBackToClass()}>
      {backLabel}
    </button>
  );

  if (resolution.status === "loading") {
    return (
      <Page
        title={`${classContext.subjectName} — ${classContext.sectionName}`}
        actions={backButton}
      >
        <Loading label="Opening class record…" />
      </Page>
    );
  }

  if (resolution.status === "error") {
    return (
      <Page
        title={`${classContext.subjectName} — ${classContext.sectionName}`}
        actions={backButton}
      >
        <Alert tone="error">
          <p>{resolution.message}</p>
          <button type="button" onClick={resolve}>
            Retry
          </button>
        </Alert>
      </Page>
    );
  }

  return (
    <>
      {backButton}
      <p className="field-hint">
        <strong>{classContext.sectionName}</strong> — {classContext.subjectName} —{" "}
        {resolution.gradingPeriodLabel} — weighting: {resolution.weightPolicyName}
      </p>
      <ClassRecordWorkspace
        classRecordId={resolution.classRecordId}
        weightPolicyName={resolution.weightPolicyName}
        assessmentService={assessmentService}
        learnerScoreService={learnerScoreService}
        exportService={exportService}
      />
    </>
  );
}
