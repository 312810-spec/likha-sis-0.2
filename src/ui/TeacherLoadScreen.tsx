import { useEffect, useRef, useState } from "react";
import type { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import type { TeachingAssignmentApplicationService } from "../application/teaching-assignment-service";
import type { TeacherLoad } from "../domain/teacher-load";
import type { TeachingAssignmentSummary } from "../domain/subject-attendance";
import { Alert } from "./components/Alert";
import { Loading } from "./components/Loading";
import { useTeacherMode } from "./theme/useTeacherMode";

interface TeacherLoadScreenProps {
  teachingAssignmentService: TeachingAssignmentApplicationService;
  subjectAttendanceService: SubjectAttendanceApplicationService;
  teacherUserId: string;
}

function formatMinutes(totalMinutes: number): string {
  if (totalMinutes <= 0) return "0m";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/** Wave 3A: the first screen to show `get_teacher_load`'s three
 * independent numbers -- computed since Teacher Load/Class Schedule
 * Foundation (ADR-0039), but with nothing to show until Teaching
 * Assignments (Wave 2Y) and Class Schedule (Wave 2Z) gave real schools
 * a way to create the data these numbers are derived from. Always a
 * self-view this wave -- see the port's own doc comment for the
 * self-or-School-Head rule `get_teacher_load` actually enforces; a
 * School Head viewing a colleague's load is a deferred candidate. */
export function TeacherLoadScreen({
  teachingAssignmentService,
  subjectAttendanceService,
  teacherUserId,
}: TeacherLoadScreenProps) {
  const { mode } = useTeacherMode();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [teacherLoad, setTeacherLoad] = useState<TeacherLoad | null>(null);
  const [assignments, setAssignments] = useState<TeachingAssignmentSummary[]>([]);
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
    Promise.all([
      teachingAssignmentService.getLoad(teacherUserId),
      subjectAttendanceService.listMyAssignments(teacherUserId),
    ])
      .then(([loadResult, assignmentResult]) => {
        if (requestRef.current !== requestId) return;
        setTeacherLoad(loadResult);
        setAssignments(assignmentResult);
      })
      .catch(() => {
        if (requestRef.current !== requestId) return;
        setError("Could not load your teaching load.");
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
  }, [teachingAssignmentService, subjectAttendanceService, teacherUserId]);

  return (
    <section aria-label="Teacher Load">
      <h2 ref={headingRef} tabIndex={-1}>
        My Teaching Load
      </h2>
      {mode === "guided" && (
        <p className="field-hint">
          These three numbers are tracked separately on purpose — a full class list doesn&rsquo;t
          say how much time each class takes, and total minutes alone doesn&rsquo;t say how many
          different subjects you&rsquo;re preparing for.
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
        <Loading label="Loading your teaching load…" />
      ) : error || !teacherLoad ? null : (
        <>
          <dl className="attendance-count">
            <div>
              <dt>Assignments</dt>
              <dd>{teacherLoad.assignmentCount}</dd>
            </div>
            <div>
              <dt>Distinct subjects</dt>
              <dd>{teacherLoad.distinctSubjectCount}</dd>
            </div>
            <div>
              <dt>Weekly instructional time</dt>
              <dd>{formatMinutes(teacherLoad.weeklyInstructionalMinutes)}</dd>
            </div>
          </dl>

          {assignments.length > 0 && (
            <>
              <h3>Counted in this load</h3>
              <ul className="learner-list">
                {assignments.map((assignment) => (
                  <li key={assignment.id}>
                    {assignment.subjectName} — {assignment.sectionName} ({assignment.schoolYear})
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
