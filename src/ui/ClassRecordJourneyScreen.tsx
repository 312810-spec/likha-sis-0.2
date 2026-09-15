import { useEffect, useRef, useState } from "react";
import type { AssessmentApplicationService } from "../application/assessment-service";
import type { ClassRecordApplicationService } from "../application/class-record-service";
import type { ExportApplicationService } from "../application/export-service";
import type { GradingApplicationService } from "../application/grading-service";
import type { LearnerScoreApplicationService } from "../application/learner-score-service";
import type { LearnerScoreSyncStatusApplicationService } from "../application/learner-score-sync-status-service";
import type { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import type { GradingWeightPolicy } from "../domain/class-record";
import { ValidationError } from "../domain/errors";
import type { GradingPeriod } from "../domain/grading";
import { AssessmentAuthoringScreen } from "./AssessmentAuthoringScreen";
import { ClassRecordWorkspace } from "./ClassRecordWorkspace";
import { Alert } from "./components/Alert";
import { Loading } from "./components/Loading";
import { Page } from "./components/Page";
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
  learnerScoreSyncStatusService?: LearnerScoreSyncStatusApplicationService;
  exportService: ExportApplicationService;
  onBackToClass: () => void | Promise<void>;
}

type Resolution =
  | { status: "loading" }
  | {
      status: "ready";
      sectionId: string;
      subjectId: string;
      schoolYear: string;
      periods: GradingPeriod[];
      policies: GradingWeightPolicy[];
    }
  | { status: "error"; message: string };

interface OpenedRecord {
  classRecordId: string;
  gradingPeriodLabel: string;
  weightPolicyName: string;
}

/**
 * First GJ-6 class-record entry slice.
 *
 * The teaching assignment is revalidated below the UI before section and
 * subject identifiers are used. The teacher must then explicitly choose the
 * grading period and DepEd grading weighting. LIKHA never guesses either
 * academic choice from array order, a default flag, or a subject name.
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
  learnerScoreSyncStatusService,
  exportService,
  onBackToClass,
}: ClassRecordJourneyScreenProps) {
  const [resolution, setResolution] = useState<Resolution>({ status: "loading" });
  const [periodId, setPeriodId] = useState("");
  const [policyId, setPolicyId] = useState("");
  const [openedRecord, setOpenedRecord] = useState<OpenedRecord | null>(null);
  const [authoring, setAuthoring] = useState(false);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const requestRef = useRef(0);

  function resolve() {
    const requestId = ++requestRef.current;
    setResolution({ status: "loading" });
    setPeriodId("");
    setPolicyId("");
    setOpenedRecord(null);
    setAuthoring(false);
    setOpenError(null);

    async function run(): Promise<Resolution> {
      const assignments = await subjectAttendanceService.listMyAssignments(teacherUserId);
      const assignment = assignments.find((candidate) => candidate.id === teachingAssignmentId);
      if (!assignment) {
        return { status: "error", message: "This class is no longer assigned to you." };
      }

      const [periods, policies] = await Promise.all([
        gradingService.listPeriodsBySchoolYear(assignment.schoolYear),
        classRecordService.listGradingWeightPolicies(),
      ]);

      if (periods.length === 0) {
        return {
          status: "error",
          message: "No grading period has been set up yet for this class's school year.",
        };
      }

      if (policies.length === 0) {
        return {
          status: "error",
          message:
            "No DepEd grading weighting is available yet. Ask your school head to set one up.",
        };
      }

      return {
        status: "ready",
        sectionId: assignment.sectionId,
        subjectId: assignment.subjectId,
        schoolYear: assignment.schoolYear,
        periods,
        policies,
      };
    }

    run()
      .then((result) => {
        if (requestRef.current !== requestId) return;
        setResolution(result);
      })
      .catch(() => {
        if (requestRef.current !== requestId) return;
        setResolution({ status: "error", message: "Could not prepare this class record." });
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

  async function openClassRecord() {
    if (resolution.status !== "ready" || opening || !periodId || !policyId) return;

    const period = resolution.periods.find((candidate) => candidate.id === periodId);
    const policy = resolution.policies.find((candidate) => candidate.id === policyId);
    if (!period || !policy) return;

    setOpening(true);
    setOpenError(null);
    try {
      const created = await classRecordService.createClassRecord(
        resolution.sectionId,
        resolution.subjectId,
        period.id,
        policy.id,
      );
      if (!created) {
        setOpenError(
          "Could not open this class record — check that the selected term and grading weighting belong to this school year.",
        );
        return;
      }

      setOpenedRecord({
        classRecordId: created.id,
        gradingPeriodLabel: period.label,
        weightPolicyName: policy.name,
      });
    } catch (err) {
      setOpenError(
        err instanceof ValidationError ? err.message : "Could not open this class record.",
      );
    } finally {
      setOpening(false);
    }
  }

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
        <Loading label="Preparing class record…" />
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

  if (openedRecord && authoring) {
    return (
      <AssessmentAuthoringScreen
        classRecordId={openedRecord.classRecordId}
        classRecordLabel={`${classContext.sectionName} — ${classContext.subjectName} — ${openedRecord.gradingPeriodLabel}`}
        assessmentService={assessmentService}
        onBack={() => setAuthoring(false)}
      />
    );
  }

  if (openedRecord) {
    return (
      <>
        <div className="journey-context-return">
          {backButton}
          <button type="button" onClick={() => setAuthoring(true)}>
            Creation Studio
          </button>
        </div>
        <p className="field-hint">
          <strong>{classContext.sectionName}</strong> — {classContext.subjectName} —{" "}
          {openedRecord.gradingPeriodLabel} — weighting: {openedRecord.weightPolicyName}
        </p>
        <ClassRecordWorkspace
          key={JSON.stringify([teacherUserId, teachingAssignmentId, openedRecord.classRecordId])}
          teachingAssignmentId={teachingAssignmentId}
          learnerScoreSyncStatusService={learnerScoreSyncStatusService}
          classRecordId={openedRecord.classRecordId}
          weightPolicyName={openedRecord.weightPolicyName}
          assessmentService={assessmentService}
          learnerScoreService={learnerScoreService}
          exportService={exportService}
        />
      </>
    );
  }

  return (
    <Page
      title={`${classContext.subjectName} — ${classContext.sectionName}`}
      actions={backButton}
      hint={
        <p className="field-hint">
          Your class is already selected. Choose the grading period and DepEd grading weighting
          explicitly before opening its scoring workspace.
        </p>
      }
    >
      {openError ? <Alert tone="error">{openError}</Alert> : null}
      <p className="field-hint">School year: {resolution.schoolYear}</p>
      <div className="form-row">
        <div className="field">
          <label htmlFor="journey-class-record-period">Grading period</label>
          <select
            id="journey-class-record-period"
            value={periodId}
            onChange={(event) => setPeriodId(event.target.value)}
          >
            <option value="">Choose a grading period</option>
            {resolution.periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="journey-class-record-policy">DepEd grading weighting</label>
          <select
            id="journey-class-record-policy"
            value={policyId}
            onChange={(event) => setPolicyId(event.target.value)}
          >
            <option value="">Choose a grading weighting</option>
            {resolution.policies.map((policy) => (
              <option key={policy.id} value={policy.id}>
                {policy.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button
        type="button"
        aria-disabled={opening || !periodId || !policyId}
        onClick={() => void openClassRecord()}
      >
        {opening ? "Opening…" : "Open class record"}
      </button>
    </Page>
  );
}
