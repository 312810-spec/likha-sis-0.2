import { useEffect, useRef, useState } from "react";
import type { AssessmentApplicationService } from "../application/assessment-service";
import type { ClassRecordApplicationService } from "../application/class-record-service";
import type { ExportApplicationService } from "../application/export-service";
import type { GradingApplicationService } from "../application/grading-service";
import type { LearnerScoreApplicationService } from "../application/learner-score-service";
import type { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import type { ClassRecordDetail, GradingWeightPolicy } from "../domain/class-record";
import { ValidationError } from "../domain/errors";
import type { GradingPeriod } from "../domain/grading";
import type { TeachingAssignmentSummary } from "../domain/subject-attendance";
import { AssessmentAuthoringScreen } from "./AssessmentAuthoringScreen";
import { ClassRecordWorkspace } from "./ClassRecordWorkspace";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { Page } from "./components/Page";
import type { TeacherClassWorkContext } from "./work-context";

interface ClassRecordsJourneyScreenProps {
  classContext: TeacherClassWorkContext;
  teacherUserId: string;
  subjectAttendanceService: SubjectAttendanceApplicationService;
  classRecordService: ClassRecordApplicationService;
  gradingService: GradingApplicationService;
  assessmentService: AssessmentApplicationService;
  learnerScoreService: LearnerScoreApplicationService;
  exportService: ExportApplicationService;
  onBackToClass: () => void | Promise<void>;
}

function recordProgress(record: ClassRecordDetail): string {
  if (record.itemCount === 0) return "No assessment items yet";
  const possible = record.itemCount * record.totalEligible;
  return `${record.itemCount} item${record.itemCount === 1 ? "" : "s"} · ${record.recordedCount} of ${possible} recorded`;
}

export function ClassRecordsJourneyScreen({
  classContext,
  teacherUserId,
  subjectAttendanceService,
  classRecordService,
  gradingService,
  assessmentService,
  learnerScoreService,
  exportService,
  onBackToClass,
}: ClassRecordsJourneyScreenProps) {
  const [assignment, setAssignment] = useState<TeachingAssignmentSummary | null>(null);
  const [records, setRecords] = useState<ClassRecordDetail[]>([]);
  const [periods, setPeriods] = useState<GradingPeriod[]>([]);
  const [policies, setPolicies] = useState<GradingWeightPolicy[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [policyId, setPolicyId] = useState("");
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [authoringRecordId, setAuthoringRecordId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  function load() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);

    subjectAttendanceService
      .listMyAssignments(teacherUserId)
      .then(async (assignments) => {
        if (requestRef.current !== requestId) return;
        const current = assignments.find((item) => item.id === classContext.teachingAssignmentId);
        if (!current) {
          setAssignment(null);
          setRecords([]);
          setError("This class is no longer available in your teaching assignments.");
          return;
        }

        const [allRecords, gradingPeriods, weightPolicies] = await Promise.all([
          classRecordService.listClassRecords(),
          gradingService.listPeriodsBySchoolYear(current.schoolYear),
          classRecordService.listGradingWeightPolicies(),
        ]);
        if (requestRef.current !== requestId) return;

        setAssignment(current);
        setRecords(
          allRecords.filter(
            (record) => record.sectionId === current.sectionId && record.subjectId === current.subjectId,
          ),
        );
        setPeriods(gradingPeriods);
        setPolicies(weightPolicies);
        setPeriodId((value) =>
          value && gradingPeriods.some((period) => period.id === value) ? value : "",
        );
        setPolicyId((value) =>
          value && weightPolicies.some((policy) => policy.id === value) ? value : "",
        );
      })
      .catch(() => {
        if (requestRef.current !== requestId) return;
        setAssignment(null);
        setRecords([]);
        setError("Could not load class records for this class.");
      })
      .finally(() => {
        if (requestRef.current !== requestId) return;
        setLoading(false);
      });
  }

  useEffect(() => {
    // Initial synchronization with assignment-owned application services.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classContext.teachingAssignmentId, teacherUserId, subjectAttendanceService, classRecordService]);

  async function createRecord() {
    if (!assignment || !periodId || !policyId || creating) return;
    setCreating(true);
    setError(null);
    try {
      const created = await classRecordService.createClassRecord(
        assignment.sectionId,
        assignment.subjectId,
        periodId,
        policyId,
      );
      if (!created) {
        setError("Could not create this class record. Check the selected term and grading weighting.");
        return;
      }
      const allRecords = await classRecordService.listClassRecords();
      setRecords(
        allRecords.filter(
          (record) =>
            record.sectionId === assignment.sectionId && record.subjectId === assignment.subjectId,
        ),
      );
      setSelectedRecordId(created.id);
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : "Could not create this class record.");
    } finally {
      setCreating(false);
    }
  }

  const selectedRecord = records.find((record) => record.id === selectedRecordId) ?? null;
  const authoringRecord = records.find((record) => record.id === authoringRecordId) ?? null;

  if (authoringRecord) {
    return (
      <>
        <div className="journey-context-return">
          <button type="button" onClick={() => setAuthoringRecordId(null)}>
            Back to class records
          </button>
          <button type="button" onClick={() => void onBackToClass()}>
            Back to {classContext.subjectName} — {classContext.sectionName}
          </button>
        </div>
        <AssessmentAuthoringScreen
          classRecordId={authoringRecord.id}
          classRecordLabel={`${authoringRecord.sectionName} — ${authoringRecord.subjectName} — ${authoringRecord.gradingPeriodLabel} (${authoringRecord.schoolYear})`}
          assessmentService={assessmentService}
          onBack={() => setAuthoringRecordId(null)}
        />
      </>
    );
  }

  if (selectedRecord) {
    return (
      <>
        <div className="journey-context-return">
          <button type="button" onClick={() => setSelectedRecordId(null)}>
            Back to class records
          </button>
          <button type="button" onClick={() => void onBackToClass()}>
            Back to {classContext.subjectName} — {classContext.sectionName}
          </button>
        </div>
        <p className="field-hint">
          <strong>{selectedRecord.sectionName}</strong> — {selectedRecord.subjectName} —{" "}
          {selectedRecord.gradingPeriodLabel} ({selectedRecord.schoolYear}) — weighting:{" "}
          {selectedRecord.weightPolicyName}
        </p>
        <ClassRecordWorkspace
          classRecordId={selectedRecord.id}
          weightPolicyName={selectedRecord.weightPolicyName}
          assessmentService={assessmentService}
          learnerScoreService={learnerScoreService}
          exportService={exportService}
        />
      </>
    );
  }

  return (
    <Page
      title={`Class Records — ${classContext.subjectName} — ${classContext.sectionName}`}
      actions={
        <button type="button" onClick={() => void onBackToClass()}>
          Back to class
        </button>
      }
      hint={
        <p className="field-hint">
          Section and subject come from your authorized teaching assignment. Choose the term and
          grading weighting explicitly; LIKHA does not guess either one.
        </p>
      }
    >
      {error ? <Alert tone="error">{error}</Alert> : null}
      {loading ? (
        <Loading label="Loading class records…" />
      ) : !assignment ? (
        error ? null : <EmptyState>This class is not available.</EmptyState>
      ) : (
        <>
          <p className="field-hint">
            {assignment.subjectName} — {assignment.sectionName} · {assignment.schoolYear}
          </p>

          {records.length === 0 ? (
            <EmptyState>No class records exist for this class yet.</EmptyState>
          ) : (
            <table className="attendance-roster">
              <thead>
                <tr>
                  <th scope="col">Term</th>
                  <th scope="col">Weighting</th>
                  <th scope="col">Progress</th>
                  <th scope="col"><span className="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td>{record.gradingPeriodLabel}</td>
                    <td>{record.weightPolicyName}</td>
                    <td>{recordProgress(record)}</td>
                    <td>
                      <button type="button" onClick={() => setSelectedRecordId(record.id)}>
                        Open scoring
                      </button>{" "}
                      <button type="button" onClick={() => setAuthoringRecordId(record.id)}>
                        Creation Studio
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <section aria-labelledby="journey-create-record-heading">
            <h3 id="journey-create-record-heading">Open another term</h3>
            <div className="form-row">
              <div className="field">
                <label htmlFor="journey-class-record-period">Term</label>
                <select
                  id="journey-class-record-period"
                  value={periodId}
                  onChange={(event) => setPeriodId(event.target.value)}
                >
                  <option value="">Choose a term</option>
                  {periods.map((period) => (
                    <option key={period.id} value={period.id}>{period.label}</option>
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
                  <option value="">Choose a weighting</option>
                  {policies.map((policy) => (
                    <option key={policy.id} value={policy.id}>{policy.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="button"
              aria-disabled={creating || !periodId || !policyId}
              onClick={createRecord}
            >
              {creating ? "Opening…" : "Open class record"}
            </button>
          </section>
        </>
      )}
    </Page>
  );
}
