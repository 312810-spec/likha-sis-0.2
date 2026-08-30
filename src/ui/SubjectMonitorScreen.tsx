import { useEffect, useRef, useState } from "react";
import type { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import type {
  SubjectAttendanceMonitor,
  TeachingAssignmentSummary,
} from "../domain/subject-attendance";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { useTeacherMode } from "./theme/useTeacherMode";

interface SubjectMonitorScreenProps {
  subjectAttendanceService: SubjectAttendanceApplicationService;
  /** Subject Monitor is always scoped to the caller's own assignments
   * (see `subject_attendance::authorize_own_assignment`) -- there is no
   * "view a colleague's monitor" mode in this screen. */
  teacherUserId: string;
  /** Wave 3D: preselect a class when arriving from Subject Attendance's
   * own contextual handoff, matching `initialAssignmentId`'s
   * established pattern (`SubjectAttendanceScreen`, `TodaysClassesScreen`). */
  initialAssignmentId?: string;
}

function todayAsIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Wave 3D: `docs/product/SUBJECT-ATTENDANCE-SPEC.md`'s Subject Monitor
 * -- per-learner attendance counts and the current consecutive-absence
 * streak for one teaching assignment. Deliberately no automatic
 * flag/threshold beyond the raw streak number, matching the domain
 * type's own comment -- configurable school thresholds are a later,
 * separately-designed enhancement.
 *
 * Adviser View remains a separate screen and authorization path -- this
 * screen never broadens its own-assignment boundary. */
export function SubjectMonitorScreen({
  subjectAttendanceService,
  teacherUserId,
  initialAssignmentId,
}: SubjectMonitorScreenProps) {
  const { mode } = useTeacherMode();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [assignments, setAssignments] = useState<TeachingAssignmentSummary[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [assignmentId, setAssignmentId] = useState("");
  const [date, setDate] = useState(todayAsIsoDate);

  const [monitor, setMonitor] = useState<SubjectAttendanceMonitor | null>(null);
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [monitorError, setMonitorError] = useState<string | null>(null);

  const assignmentsRequestRef = useRef(0);
  const monitorRequestRef = useRef(0);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  function loadAssignments() {
    const requestId = ++assignmentsRequestRef.current;
    setAssignmentsLoading(true);
    setAssignmentsError(null);
    subjectAttendanceService
      .listMyAssignments(teacherUserId)
      .then((result) => {
        if (assignmentsRequestRef.current !== requestId) return;
        setAssignments(result);
        const preselected =
          initialAssignmentId && result.some((a) => a.id === initialAssignmentId)
            ? initialAssignmentId
            : result[0]?.id;
        if (preselected) setAssignmentId((current) => current || preselected);
      })
      .catch(() => {
        if (assignmentsRequestRef.current !== requestId) return;
        setAssignmentsError("Could not load your classes.");
      })
      .finally(() => {
        if (assignmentsRequestRef.current !== requestId) return;
        setAssignmentsLoading(false);
      });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAssignments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectAttendanceService, teacherUserId]);

  function loadMonitor() {
    if (!assignmentId) return;
    const requestId = ++monitorRequestRef.current;
    setMonitorLoading(true);
    setMonitorError(null);
    subjectAttendanceService
      .monitor(assignmentId, date)
      .then((result) => {
        if (monitorRequestRef.current !== requestId) return;
        setMonitor(result);
      })
      .catch(() => {
        if (monitorRequestRef.current !== requestId) return;
        setMonitorError("Could not load the attendance monitor for this class.");
      })
      .finally(() => {
        if (monitorRequestRef.current !== requestId) return;
        setMonitorLoading(false);
      });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMonitor(null);
    setMonitorError(null);
    loadMonitor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectAttendanceService, assignmentId, date]);

  const selectedAssignment = assignments.find((a) => a.id === assignmentId) ?? null;

  return (
    <section aria-label="Subject Monitor">
      <h2 ref={headingRef} tabIndex={-1}>
        Subject Monitor
      </h2>
      {mode === "guided" && (
        <p className="field-hint">
          A running total of each learner's marks for this class so far, plus how many sessions in a
          row they've been marked absent. This is a monitoring tool for you — it never changes the
          official attendance record.
        </p>
      )}
      <p className="field-hint">Subject attendance — not SF2.</p>

      {assignmentsError && (
        <Alert tone="error">
          <p>{assignmentsError}</p>
          <button type="button" onClick={loadAssignments}>
            Retry
          </button>
        </Alert>
      )}

      {assignmentsLoading ? (
        <Loading label="Loading your classes…" />
      ) : assignments.length === 0 ? (
        assignmentsError ? null : (
          <EmptyState>You have no teaching assignments yet.</EmptyState>
        )
      ) : (
        <>
          <div className="form-row">
            <div className="field">
              <label htmlFor="subject-monitor-assignment">Class</label>
              <select
                id="subject-monitor-assignment"
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
              <label htmlFor="subject-monitor-date">As of</label>
              <input
                id="subject-monitor-date"
                type="date"
                value={date}
                max={todayAsIsoDate()}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
          </div>

          {selectedAssignment && mode === "guided" && (
            <p className="field-hint">
              {selectedAssignment.subjectName} for {selectedAssignment.sectionName}.
            </p>
          )}

          {monitorError && (
            <Alert tone="error">
              <p>{monitorError}</p>
              <button type="button" onClick={loadMonitor}>
                Retry
              </button>
            </Alert>
          )}

          {monitorLoading ? (
            <Loading label="Loading attendance monitor…" />
          ) : monitorError ? null : !monitor ? null : monitor.rows.length === 0 ? (
            <EmptyState>No learners enrolled in this section on this date.</EmptyState>
          ) : (
            <>
              <p className="attendance-count">
                <strong>{monitor.heldSessionCount}</strong> session
                {monitor.heldSessionCount === 1 ? "" : "s"} held so far
              </p>
              <table className="attendance-roster">
                <thead>
                  <tr>
                    <th scope="col">Learner</th>
                    <th scope="col">Present</th>
                    <th scope="col">Absent</th>
                    <th scope="col">Late</th>
                    <th scope="col">Excused</th>
                    <th scope="col">Current absence streak</th>
                  </tr>
                </thead>
                <tbody>
                  {monitor.rows.map((row) => (
                    <tr key={row.membershipId}>
                      <th scope="row">
                        {row.givenName} {row.familyName}
                      </th>
                      <td>{row.presentCount}</td>
                      <td>{row.absentCount}</td>
                      <td>{row.lateCount}</td>
                      <td>{row.excusedCount}</td>
                      <td>{row.currentConsecutiveAbsences}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </section>
  );
}
