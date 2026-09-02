import { useEffect, useRef, useState } from "react";
import type { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import { ValidationError } from "../domain/errors";
import { ENTRY_STATUSES } from "../domain/subject-attendance";
import type {
  EntryStatus,
  SubjectAttendanceRosterRow,
  SubjectAttendanceSession,
  TeachingAssignmentSummary,
} from "../domain/subject-attendance";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { StatusChip } from "./components/StatusChip";
import { useTeacherMode } from "./theme/useTeacherMode";

interface SubjectAttendanceScreenProps {
  subjectAttendanceService: SubjectAttendanceApplicationService;
  /** The signed-in teacher's own user id -- Subject Attendance is
   * always scoped to the caller's own assignments (see
   * `subject_attendance::authorize_own_assignment`); there is no
   * "view a colleague's class" mode in this screen. */
  teacherUserId: string;
  /** Wave 2X: preselect a class when arriving from Today's Classes'
   * "Check attendance" action. Verified against the loaded assignment
   * list before use, same as `AttendanceScreen`'s `initialSectionId` --
   * a mount-time-only default, never re-applied on a later prop change. */
  initialAssignmentId?: string;
}

const STATUS_LABELS: Record<EntryStatus, string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  excused: "Excused",
};

function todayAsIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buttonKey(learnerId: string, status: EntryStatus): string {
  return `${learnerId}:${status}`;
}

export function SubjectAttendanceScreen({
  subjectAttendanceService,
  teacherUserId,
  initialAssignmentId,
}: SubjectAttendanceScreenProps) {
  const { mode } = useTeacherMode();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [assignments, setAssignments] = useState<TeachingAssignmentSummary[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [assignmentId, setAssignmentId] = useState("");
  const [date, setDate] = useState(todayAsIsoDate);

  // Every recorded/no-class session for the selected assignment --
  // reused as a lookup, never mutated to fabricate a row: a date with
  // no entry here has genuinely never been opened ("not checked"),
  // matching the domain's own "no row = not yet recorded" idiom. See
  // docs/adr/0055-subject-attendance-foundation.md.
  const [sessions, setSessions] = useState<SubjectAttendanceSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [openingSession, setOpeningSession] = useState(false);

  const [roster, setRoster] = useState<SubjectAttendanceRosterRow[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [savingLearnerIds, setSavingLearnerIds] = useState<ReadonlySet<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<
    Record<string, { message: string; status: EntryStatus }>
  >({});
  const [bulkMarking, setBulkMarking] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const writeGenerationRef = useRef<Map<string, number>>(new Map());
  const assignmentsRequestRef = useRef(0);
  const sessionsRequestRef = useRef(0);
  const rosterRequestRef = useRef(0);
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

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
        // initialAssignmentId is intentionally a mount-time-only default,
        // not a synced prop -- read it here (deliberately omitted from
        // this effect's own dependency list below) rather than reacting
        // to a later change to initialAssignmentId from a parent re-render.
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
    loadAssignments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectAttendanceService, teacherUserId]);

  function loadSessions() {
    if (!assignmentId) return;
    const requestId = ++sessionsRequestRef.current;
    setSessionsLoading(true);
    setSessionsError(null);
    subjectAttendanceService
      .listSessions(assignmentId)
      .then((result) => {
        if (sessionsRequestRef.current !== requestId) return;
        setSessions(result);
      })
      .catch(() => {
        if (sessionsRequestRef.current !== requestId) return;
        setSessionsError("Could not load this class's attendance history.");
      })
      .finally(() => {
        if (sessionsRequestRef.current !== requestId) return;
        setSessionsLoading(false);
      });
  }

  useEffect(() => {
    setRoster([]);
    setRosterError(null);
    setConfirmation(null);
    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectAttendanceService, assignmentId]);

  const sessionForDate = sessions.find((s) => s.sessionDate === date) ?? null;

  function loadRoster(sessionId: string) {
    const requestId = ++rosterRequestRef.current;
    setRosterLoading(true);
    setRosterError(null);
    subjectAttendanceService
      .rosterForSession(assignmentId, sessionId)
      .then((result) => {
        if (rosterRequestRef.current !== requestId) return;
        setRoster(result ?? []);
      })
      .catch(() => {
        if (rosterRequestRef.current !== requestId) return;
        setRosterError("Could not load the roster for this session.");
      })
      .finally(() => {
        if (rosterRequestRef.current !== requestId) return;
        setRosterLoading(false);
      });
  }

  useEffect(() => {
    setRoster([]);
    setRosterError(null);
    setRowErrors({});
    if (sessionForDate && sessionForDate.status === "held") {
      loadRoster(sessionForDate.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionForDate?.id, sessionForDate?.status]);

  function handleAssignmentChange(newAssignmentId: string) {
    setConfirmation(null);
    setAssignmentId(newAssignmentId);
  }

  function handleDateChange(newDate: string) {
    setConfirmation(null);
    setDate(newDate);
  }

  async function handleOpenSession() {
    if (openingSession) return;
    setSessionsError(null);
    setOpeningSession(true);
    try {
      const opened = await subjectAttendanceService.openSession(assignmentId, date);
      if (opened) setSessions((current) => [...current, opened]);
    } catch (err) {
      setSessionsError(
        err instanceof ValidationError ? err.message : "Could not open this session.",
      );
    } finally {
      setOpeningSession(false);
    }
  }

  async function handleMarkNoClass() {
    if (openingSession) return;
    setSessionsError(null);
    setOpeningSession(true);
    try {
      const opened = await subjectAttendanceService.markNoClass(assignmentId, date);
      if (opened) setSessions((current) => [...current, opened]);
    } catch (err) {
      setSessionsError(
        err instanceof ValidationError ? err.message : "Could not mark this day no class.",
      );
    } finally {
      setOpeningSession(false);
    }
  }

  async function handleMark(row: SubjectAttendanceRosterRow, status: EntryStatus) {
    if (!sessionForDate) return;
    if (bulkMarking) return;
    if (row.entryStatus === status) return;

    setConfirmation(null);
    setRowErrors((current) => {
      if (!(row.membershipId in current)) return current;
      const next = { ...current };
      delete next[row.membershipId];
      return next;
    });
    const generation = (writeGenerationRef.current.get(row.membershipId) ?? 0) + 1;
    writeGenerationRef.current.set(row.membershipId, generation);
    setSavingLearnerIds((current) => new Set(current).add(row.membershipId));

    try {
      const outcome = await subjectAttendanceService.recordEntry(
        assignmentId,
        sessionForDate.id,
        row.membershipId,
        status,
      );
      if (writeGenerationRef.current.get(row.membershipId) !== generation) return;
      if (outcome.kind === "recorded") {
        setRoster((current) =>
          current.map((candidate) =>
            candidate.membershipId === row.membershipId
              ? { ...candidate, entryStatus: status }
              : candidate,
          ),
        );
      } else {
        const message =
          outcome.kind === "sessionIsNoClass"
            ? "This day is marked no class."
            : outcome.kind === "membershipNotInSession"
              ? "This learner is no longer on the roster for this date."
              : "This session could not be found. Try reloading the page.";
        setRowErrors((current) => ({ ...current, [row.membershipId]: { message, status } }));
      }
    } catch (err) {
      if (writeGenerationRef.current.get(row.membershipId) !== generation) return;
      setRowErrors((current) => ({
        ...current,
        [row.membershipId]: {
          message: err instanceof ValidationError ? err.message : "Could not save this mark.",
          status,
        },
      }));
    } finally {
      if (writeGenerationRef.current.get(row.membershipId) === generation) {
        setSavingLearnerIds((current) => {
          const next = new Set(current);
          next.delete(row.membershipId);
          return next;
        });
      }
    }
  }

  async function handleMarkAllPresent() {
    if (!sessionForDate) return;
    if (bulkMarking) return;
    setRosterError(null);
    setConfirmation(null);
    setBulkMarking(true);
    try {
      const unmarkedCount = roster.filter((row) => row.entryStatus === null).length;
      const updated = await subjectAttendanceService.markAllPresent(
        assignmentId,
        sessionForDate.id,
      );
      setRoster(updated ?? []);
      setConfirmation(
        unmarkedCount === 0
          ? "Everyone already had a mark for this session — nothing changed."
          : `Marked ${unmarkedCount} learner${unmarkedCount === 1 ? "" : "s"} Present. Existing marks were left as-is.`,
      );
    } catch (err) {
      setRosterError(
        err instanceof ValidationError ? err.message : "Could not mark the roster present.",
      );
    } finally {
      setBulkMarking(false);
    }
  }

  function handleRosterKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    row: SubjectAttendanceRosterRow,
    status: EntryStatus,
  ) {
    const key = event.key;
    if (key === "ArrowDown" || key === "ArrowUp") {
      event.preventDefault();
      const index = roster.findIndex((candidate) => candidate.membershipId === row.membershipId);
      const target = roster[key === "ArrowDown" ? index + 1 : index - 1];
      if (!target) return;
      buttonRefs.current.get(buttonKey(target.membershipId, status))?.focus();
    }
  }

  const markedCount = roster.filter((row) => row.entryStatus !== null).length;
  const remainingCount = roster.length - markedCount;
  const selectedAssignment = assignments.find((a) => a.id === assignmentId) ?? null;

  return (
    <section aria-label="Subject Attendance">
      <h2 ref={headingRef} tabIndex={-1}>
        Subject Attendance
      </h2>
      {mode === "guided" && (
        <p className="field-hint">
          Check whether your students attended this class period. This is a monitoring tool for you
          — it is separate from School Form 2 and never changes the official attendance record.
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
              <label htmlFor="subject-attendance-assignment">Class</label>
              <select
                id="subject-attendance-assignment"
                value={assignmentId}
                onChange={(event) => handleAssignmentChange(event.target.value)}
              >
                {assignments.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>
                    {assignment.subjectName} — {assignment.sectionName} ({assignment.schoolYear})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="subject-attendance-date">Date</label>
              <input
                id="subject-attendance-date"
                type="date"
                value={date}
                max={todayAsIsoDate()}
                onChange={(event) => handleDateChange(event.target.value)}
              />
            </div>
          </div>

          {selectedAssignment && mode === "guided" && (
            <p className="field-hint">
              {selectedAssignment.subjectName} for {selectedAssignment.sectionName}.
            </p>
          )}

          {sessionsError && (
            <Alert tone="error">
              <p>{sessionsError}</p>
              <button type="button" onClick={loadSessions}>
                Retry
              </button>
            </Alert>
          )}
          {confirmation && <Alert tone="success">{confirmation}</Alert>}

          {sessionsLoading ? (
            <Loading label="Checking this class's attendance history…" />
          ) : sessionsError ? null : !sessionForDate ? (
            <div className="section-roster-action-panel">
              <p>No attendance has been checked for this date yet.</p>
              <button
                type="button"
                className="button-primary"
                aria-disabled={openingSession}
                onClick={handleOpenSession}
              >
                {openingSession ? "Opening…" : "Check attendance"}
              </button>{" "}
              <button type="button" aria-disabled={openingSession} onClick={handleMarkNoClass}>
                No class today
              </button>
              {mode === "guided" && (
                <p className="field-hint">
                  Use "Check attendance" if the class met, or "No class today" for a suspension,
                  holiday, school activity, or your own leave.
                </p>
              )}
            </div>
          ) : sessionForDate.status === "no_class" ? (
            <EmptyState>This day is marked no class. No attendance to check.</EmptyState>
          ) : (
            <>
              {rosterError && (
                <Alert tone="error">
                  <p>{rosterError}</p>
                  <button type="button" onClick={() => loadRoster(sessionForDate.id)}>
                    Retry
                  </button>
                </Alert>
              )}

              {rosterLoading ? (
                <Loading label="Loading roster…" />
              ) : rosterError ? null : roster.length === 0 ? (
                <EmptyState>No learners enrolled in this section on this date.</EmptyState>
              ) : (
                <>
                  <p className="attendance-count">
                    <strong>
                      {markedCount} of {roster.length} marked
                    </strong>{" "}
                    · {remainingCount} remaining
                  </p>
                  {mode === "guided" && (
                    <p className="field-hint">
                      Use "Mark all present" to fill in everyone who doesn't have a mark yet — it
                      never changes a mark you've already made.
                    </p>
                  )}
                  <button
                    type="button"
                    className="button-primary"
                    aria-disabled={bulkMarking || roster.every((row) => row.entryStatus !== null)}
                    onClick={handleMarkAllPresent}
                  >
                    {bulkMarking ? "Marking…" : "Mark all present"}
                  </button>
                  <p className="field-hint">
                    Only fills in learners with no mark yet — never changes a mark you've already
                    made.
                  </p>
                  <table className="attendance-roster">
                    <thead>
                      <tr>
                        <th scope="col">Learner</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roster.map((row) => {
                        const rowError = rowErrors[row.membershipId];
                        const isSaving = savingLearnerIds.has(row.membershipId);
                        return (
                          <tr key={row.membershipId}>
                            <th scope="row">
                              {row.givenName} {row.familyName}
                            </th>
                            <td>
                              <div
                                role="group"
                                aria-label={`Subject attendance status for ${row.givenName} ${row.familyName}`}
                              >
                                {ENTRY_STATUSES.map((status) => (
                                  <button
                                    key={status}
                                    type="button"
                                    ref={(el) => {
                                      const key = buttonKey(row.membershipId, status);
                                      if (el) buttonRefs.current.set(key, el);
                                      else buttonRefs.current.delete(key);
                                    }}
                                    aria-pressed={row.entryStatus === status}
                                    aria-disabled={bulkMarking}
                                    onClick={() => handleMark(row, status)}
                                    onKeyDown={(event) => handleRosterKeyDown(event, row, status)}
                                  >
                                    {STATUS_LABELS[status]}
                                  </button>
                                ))}
                              </div>
                              {row.entryStatus === null && !isSaving && (
                                <StatusChip tone="neutral">Not marked</StatusChip>
                              )}
                              {isSaving && (
                                <span className="field-hint" role="status">
                                  Saving…
                                </span>
                              )}
                              {rowError && (
                                <Alert tone="error" inline>
                                  <span>{rowError.message}</span>{" "}
                                  {rowError.message === "Could not save this mark." && (
                                    <button
                                      type="button"
                                      onClick={() => handleMark(row, rowError.status)}
                                    >
                                      Retry
                                    </button>
                                  )}
                                </Alert>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
