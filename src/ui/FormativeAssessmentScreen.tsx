import { useEffect, useState } from "react";
import type { FormativeAssessmentApplicationService } from "../application/formative-assessment-service";
import type { GradingApplicationService } from "../application/grading-service";
import type { SectionApplicationService } from "../application/section-service";
import type { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import { ValidationError } from "../domain/errors";
import {
  ESRU_RATINGS,
  formatEsruRatingLabel,
  FormativeAssessmentValidationError,
  type EsruRating,
  type FormativeAssessmentLog,
} from "../domain/formative-assessment";
import type { GradingPeriod } from "../domain/grading";
import type { SectionRosterMember } from "../domain/section";
import type { TeachingAssignmentSummary } from "../domain/subject-attendance";
import { Alert } from "./components/Alert";
import { DataTable } from "./components/DataTable";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { Page } from "./components/Page";
import { useTeacherMode } from "./theme/useTeacherMode";

interface FormativeAssessmentScreenProps {
  formativeAssessmentService: FormativeAssessmentApplicationService;
  subjectAttendanceService: SubjectAttendanceApplicationService;
  sectionService: SectionApplicationService;
  gradingService: GradingApplicationService;
  /** The signed-in teacher's own user id -- ESRU logging is always
   * scoped to the caller's own assignments (see
   * `formative_assessment::authorize_own_assignment`); there is no
   * "log ESRU for a colleague's class" mode in this screen. */
  teacherUserId: string;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function learnerLabel(row: SectionRosterMember): string {
  return `${row.familyName}, ${row.givenName}`;
}

/**
 * Formative Assessment (ESRU) logging (Batch 11, ADR-0082) -- quick
 * per-learner logging of an ESRU observation for one of the teacher's own
 * classes, reachable from the same "Learner Records"/class-record area as
 * Subject Attendance and Transfers. `esru_rating` is always shown as the
 * bare letter with its gloss word explicitly flagged unverified (see
 * `formatEsruRatingLabel`) -- see
 * `docs/product/OWNER-DECISIONS-NEEDED.md` item 3 for why the gloss is
 * unverified and `repository::formative_assessment`'s doc comment for
 * why only the letter is ever persisted. Follows `TransfersScreen`'s
 * create-form-plus-list shape.
 */
export function FormativeAssessmentScreen({
  formativeAssessmentService,
  subjectAttendanceService,
  sectionService,
  gradingService,
  teacherUserId,
}: FormativeAssessmentScreenProps) {
  const { mode } = useTeacherMode();

  const [assignments, setAssignments] = useState<TeachingAssignmentSummary[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [assignmentId, setAssignmentId] = useState("");

  const [roster, setRoster] = useState<SectionRosterMember[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [learnerId, setLearnerId] = useState("");

  const [gradingPeriods, setGradingPeriods] = useState<GradingPeriod[]>([]);
  const [gradingPeriodsLoading, setGradingPeriodsLoading] = useState(false);
  const [gradingPeriodId, setGradingPeriodId] = useState("");

  const [logs, setLogs] = useState<FormativeAssessmentLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const [activityName, setActivityName] = useState("");
  const [esruRating, setEsruRating] = useState<EsruRating>("E");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  function loadAssignments(): () => void {
    let cancelled = false;
    setAssignmentsLoading(true);
    subjectAttendanceService
      .listMyAssignments(teacherUserId)
      .then((result) => {
        if (cancelled) return;
        setAssignments(result);
        const first = result[0];
        if (first) setAssignmentId((current) => current || first.id);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load your classes.");
      })
      .finally(() => {
        if (!cancelled) setAssignmentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    return loadAssignments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectAttendanceService, teacherUserId]);

  const selectedAssignment = assignments.find((a) => a.id === assignmentId) ?? null;

  function loadLogs() {
    if (!assignmentId) return;
    setLogsLoading(true);
    formativeAssessmentService
      .listForAssignment(assignmentId)
      .then((result) => setLogs(result))
      .catch(() => setError("Could not load this class's ESRU log."))
      .finally(() => setLogsLoading(false));
  }

  function loadRosterAndGradingPeriods(): () => void {
    setError(null);
    setConfirmation(null);
    setLearnerId("");
    setGradingPeriodId("");
    if (!selectedAssignment) {
      setRoster([]);
      setGradingPeriods([]);
      setLogs([]);
      return () => {};
    }
    let cancelled = false;

    setRosterLoading(true);
    sectionService
      .roster(selectedAssignment.sectionId, todayIsoDate())
      .then((result) => {
        if (cancelled) return;
        setRoster(result);
        const first = result[0];
        if (first) setLearnerId(first.learnerId);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load this class's roster.");
      })
      .finally(() => {
        if (!cancelled) setRosterLoading(false);
      });

    setGradingPeriodsLoading(true);
    gradingService
      .listPeriodsBySchoolYear(selectedAssignment.schoolYear)
      .then((result) => {
        if (cancelled) return;
        setGradingPeriods(result);
        const first = result[0];
        if (first) setGradingPeriodId(first.id);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load grading periods for this school year.");
      })
      .finally(() => {
        if (!cancelled) setGradingPeriodsLoading(false);
      });

    loadLogs();
    return () => {
      cancelled = true;
    };
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    return loadRosterAndGradingPeriods();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId, selectedAssignment?.sectionId, selectedAssignment?.schoolYear]);

  function resetForm() {
    setActivityName("");
    setEsruRating("E");
    setNotes("");
    setError(null);
  }

  async function handleSave() {
    if (saving || !assignmentId || !learnerId || !gradingPeriodId) return;
    setSaving(true);
    setError(null);
    try {
      await formativeAssessmentService.record({
        teachingAssignmentId: assignmentId,
        learnerId,
        gradingPeriodId,
        activityName,
        esruRating,
        notes: notes.length > 0 ? notes : undefined,
      });
      setConfirmation("ESRU log saved.");
      resetForm();
      loadLogs();
    } catch (err) {
      setError(
        err instanceof FormativeAssessmentValidationError || err instanceof ValidationError
          ? err.message
          : "Could not save this ESRU log.",
      );
    } finally {
      setSaving(false);
    }
  }

  function learnerNameFor(id: string): string {
    const row = roster.find((r) => r.learnerId === id);
    return row ? learnerLabel(row) : id;
  }

  function gradingPeriodLabelFor(id: string): string {
    const period = gradingPeriods.find((p) => p.id === id);
    return period ? period.label : id;
  }

  const canSave =
    !saving &&
    assignmentId.length > 0 &&
    learnerId.length > 0 &&
    gradingPeriodId.length > 0 &&
    activityName.trim().length > 0;

  return (
    <Page
      title="Formative Assessment (ESRU)"
      hint={
        mode === "guided" ? (
          <p className="field-hint">
            Quickly log an ESRU observation (Exploration, Structured practice, Reflection,
            Understanding) for one learner during an activity. This is your own formative
            note-taking tool — it is separate from grades and quiz scores.
          </p>
        ) : undefined
      }
    >
      <p className="field-hint">
        The E/S/R/U meaning shown below is unverified against any official DepEd source — only the
        letter itself is ever saved.
      </p>

      {error && <Alert tone="error">{error}</Alert>}
      {confirmation && <Alert tone="success">{confirmation}</Alert>}

      {assignmentsLoading ? (
        <Loading label="Loading your classes…" />
      ) : assignments.length === 0 ? (
        <EmptyState>You have no teaching assignments yet.</EmptyState>
      ) : (
        <>
          <div className="form-row">
            <div className="field">
              <label htmlFor="esru-assignment">Class</label>
              <select
                id="esru-assignment"
                value={assignmentId}
                onChange={(event) => setAssignmentId(event.target.value)}
              >
                {assignments.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>
                    {assignment.subjectName} — {assignment.sectionName} ({assignment.schoolYear})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="esru-grading-period">Quarter</label>
              <select
                id="esru-grading-period"
                value={gradingPeriodId}
                disabled={gradingPeriodsLoading || gradingPeriods.length === 0}
                onChange={(event) => setGradingPeriodId(event.target.value)}
              >
                {gradingPeriods.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {rosterLoading ? (
            <Loading label="Loading roster…" />
          ) : roster.length === 0 ? (
            <EmptyState>No learners enrolled in this section yet.</EmptyState>
          ) : (
            <>
              <div className="field">
                <label htmlFor="esru-learner">Learner</label>
                <select
                  id="esru-learner"
                  value={learnerId}
                  onChange={(event) => setLearnerId(event.target.value)}
                >
                  {roster.map((row) => (
                    <option key={row.membershipId} value={row.learnerId}>
                      {learnerLabel(row)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="esru-activity">Activity name</label>
                <input
                  id="esru-activity"
                  type="text"
                  value={activityName}
                  onChange={(event) => setActivityName(event.target.value)}
                />
              </div>

              <div className="field">
                <span id="esru-rating-label">ESRU rating</span>
                <div role="group" aria-labelledby="esru-rating-label" className="form-row">
                  {ESRU_RATINGS.map((rating) => (
                    <button
                      key={rating}
                      type="button"
                      aria-pressed={esruRating === rating}
                      title={formatEsruRatingLabel(rating)}
                      onClick={() => setEsruRating(rating)}
                    >
                      {rating}
                    </button>
                  ))}
                </div>
                <p className="field-hint">{formatEsruRatingLabel(esruRating)}</p>
              </div>

              <div className="field">
                <label htmlFor="esru-notes">Notes (optional)</label>
                <textarea
                  id="esru-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>

              <button
                type="button"
                className="button-primary"
                aria-disabled={!canSave}
                onClick={() => void handleSave()}
              >
                {saving ? "Saving…" : "Save ESRU log"}
              </button>
            </>
          )}
        </>
      )}

      <h3>ESRU log for this class</h3>
      {logsLoading ? (
        <Loading label="Loading ESRU log…" />
      ) : logs.length === 0 ? (
        <EmptyState>No ESRU logs recorded yet for this class.</EmptyState>
      ) : (
        <DataTable
          caption="ESRU log"
          reflowAt={640}
          columns={[
            { key: "learner", header: "Learner" },
            { key: "quarter", header: "Quarter" },
            { key: "activity", header: "Activity" },
            { key: "rating", header: "ESRU" },
            { key: "notes", header: "Notes" },
          ]}
          rows={logs.map((log) => ({
            key: log.id,
            rowHeader: "learner",
            cells: {
              learner: learnerNameFor(log.learnerId),
              quarter: gradingPeriodLabelFor(log.gradingPeriodId),
              activity: log.activityName,
              rating: <span title={formatEsruRatingLabel(log.esruRating)}>{log.esruRating}</span>,
              notes: log.notes ?? "",
            },
          }))}
        />
      )}
    </Page>
  );
}
