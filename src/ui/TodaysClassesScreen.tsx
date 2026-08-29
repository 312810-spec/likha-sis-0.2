import { useEffect, useRef, useState } from "react";
import type { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import type { TeachingAssignmentSummary } from "../domain/subject-attendance";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { useTeacherMode } from "./theme/useTeacherMode";

interface TodaysClassesScreenProps {
  subjectAttendanceService: SubjectAttendanceApplicationService;
  teacherUserId: string;
  onCheckAttendance: (teachingAssignmentId: string) => void;
}

type ClassStatus = "not_checked" | "held" | "no_class";

interface TodaysClassOccurrence {
  assignment: TeachingAssignmentSummary;
  startsAt: string;
  endsAt: string;
  room: string | null;
  status: ClassStatus;
}

const STATUS_LABELS: Record<ClassStatus, string> = {
  not_checked: "Not checked",
  held: "Checked",
  no_class: "No class",
};

function todayAsIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Every class the signed-in teacher meets today, in order, with each
 * one's attendance-check status -- the first real UI use for both
 * `list_teacher_assignments`' schedule data and the "not checked" state
 * `docs/adr/0055-subject-attendance-foundation.md`'s Wave 2V addendum
 * left implicit. See `domain/schedule-meeting.ts` for the weekday
 * convention this screen establishes. */
export function TodaysClassesScreen({
  subjectAttendanceService,
  teacherUserId,
  onCheckAttendance,
}: TodaysClassesScreenProps) {
  const { mode } = useTeacherMode();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [occurrences, setOccurrences] = useState<TodaysClassOccurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  function load() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    const today = todayAsIsoDate();
    const todaysWeekday = new Date().getDay();

    subjectAttendanceService
      .listMyAssignments(teacherUserId)
      .then(async (assignments) => {
        const perAssignment = await Promise.all(
          assignments.map(async (assignment) => {
            const meetings = await subjectAttendanceService.listMeetings(assignment.id);
            const todaysMeetings = meetings.filter((meeting) => meeting.weekday === todaysWeekday);
            if (todaysMeetings.length === 0) return [];

            const sessions = await subjectAttendanceService.listSessions(assignment.id);
            const todaysSession = sessions.find((session) => session.sessionDate === today);
            const status: ClassStatus = !todaysSession
              ? "not_checked"
              : todaysSession.status === "no_class"
                ? "no_class"
                : "held";

            return todaysMeetings.map((meeting) => ({
              assignment,
              startsAt: meeting.startsAt,
              endsAt: meeting.endsAt,
              room: meeting.room,
              status,
            }));
          }),
        );
        if (requestRef.current !== requestId) return;
        const flattened = perAssignment.flat().sort((a, b) => a.startsAt.localeCompare(b.startsAt));
        setOccurrences(flattened);
      })
      .catch(() => {
        if (requestRef.current !== requestId) return;
        setError("Could not load today's classes.");
      })
      .finally(() => {
        if (requestRef.current !== requestId) return;
        setLoading(false);
      });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectAttendanceService, teacherUserId]);

  return (
    <section aria-label="Today's Classes">
      <h2 ref={headingRef} tabIndex={-1}>
        Today&rsquo;s Classes
      </h2>
      {mode === "guided" && (
        <p className="field-hint">
          Every class you teach today, in the order they meet. Select &ldquo;Check attendance&rdquo;
          to open one.
        </p>
      )}

      {error && (
        <Alert tone="error">
          <p>{error}</p>
          <button type="button" onClick={load}>
            Retry
          </button>
        </Alert>
      )}

      {loading ? (
        <Loading label="Loading today's classes…" />
      ) : error ? null : occurrences.length === 0 ? (
        <EmptyState>No classes scheduled for you today.</EmptyState>
      ) : (
        <table className="attendance-roster">
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Class</th>
              <th scope="col">Status</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {occurrences.map((occurrence, index) => (
              <tr key={`${occurrence.assignment.id}-${occurrence.startsAt}-${index}`}>
                <th scope="row">
                  {occurrence.startsAt}–{occurrence.endsAt}
                  {occurrence.room ? ` · ${occurrence.room}` : ""}
                </th>
                <td>
                  {occurrence.assignment.subjectName} — {occurrence.assignment.sectionName}
                </td>
                <td>{STATUS_LABELS[occurrence.status]}</td>
                <td>
                  <button type="button" onClick={() => onCheckAttendance(occurrence.assignment.id)}>
                    Check attendance
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
