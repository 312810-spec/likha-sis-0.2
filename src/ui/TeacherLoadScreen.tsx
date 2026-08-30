import { useEffect, useRef, useState } from "react";
import type { SchoolMemberApplicationService } from "../application/school-member-service";
import type { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import type { TeachingAssignmentApplicationService } from "../application/teaching-assignment-service";
import type { SchoolMember } from "../domain/school-member";
import type { TeacherLoad } from "../domain/teacher-load";
import type { TeachingAssignmentSummary } from "../domain/subject-attendance";
import { Alert } from "./components/Alert";
import { Loading } from "./components/Loading";
import { useTeacherMode } from "./theme/useTeacherMode";

interface TeacherLoadScreenProps {
  teachingAssignmentService: TeachingAssignmentApplicationService;
  subjectAttendanceService: SubjectAttendanceApplicationService;
  schoolMemberService: SchoolMemberApplicationService;
  /** The signed-in teacher's own user id -- always the default view,
   * and the only id a Teacher session may actually view (enforced
   * server-side by `auth::authorize_view_teacher_load`, not by this
   * picker being hidden). */
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
 * a way to create the data these numbers are derived from.
 *
 * Wave 3C: a School Head may also view a colleague's load, matching
 * `auth::authorize_view_teacher_load`'s own self-or-School-Head rule.
 * Every authenticated school member sees the same "View" picker
 * (`list_school_members`, reused from Wave 2Y's Teaching Assignments
 * picker) -- security must not rely on UI hiding, so a Teacher session
 * that picks a colleague simply gets the backend's own denial surfaced
 * as a local message (safe now that Wave 3B closed the false-positive
 * global-logout bug this exact path would otherwise have hit). */
export function TeacherLoadScreen({
  teachingAssignmentService,
  subjectAttendanceService,
  schoolMemberService,
  teacherUserId,
}: TeacherLoadScreenProps) {
  const { mode } = useTeacherMode();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [members, setMembers] = useState<SchoolMember[]>([]);
  const [viewedTeacherId, setViewedTeacherId] = useState(teacherUserId);
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
      teachingAssignmentService.getLoad(viewedTeacherId),
      subjectAttendanceService.listMyAssignments(viewedTeacherId),
      schoolMemberService.listMembers(),
    ])
      .then(([loadResult, assignmentResult, memberResult]) => {
        if (requestRef.current !== requestId) return;
        setTeacherLoad(loadResult);
        setAssignments(assignmentResult);
        setMembers(memberResult);
      })
      .catch(() => {
        if (requestRef.current !== requestId) return;
        setError(
          viewedTeacherId === teacherUserId
            ? "Could not load your teaching load."
            : "Could not load this teacher's load — you may not have permission to view it.",
        );
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
  }, [teachingAssignmentService, subjectAttendanceService, schoolMemberService, viewedTeacherId]);

  const teachers = members.filter((member) => member.roles.includes("teacher"));
  const otherTeachers = teachers.filter((member) => member.id !== teacherUserId);
  const viewingSelf = viewedTeacherId === teacherUserId;
  const viewedName = members.find((member) => member.id === viewedTeacherId)?.displayName;

  return (
    <section aria-label="Teacher Load">
      <h2 ref={headingRef} tabIndex={-1}>
        {viewingSelf ? "My Teaching Load" : `${viewedName ?? "Teacher"}'s Teaching Load`}
      </h2>
      {mode === "guided" && (
        <p className="field-hint">
          These three numbers are tracked separately on purpose — a full class list doesn&rsquo;t
          say how much time each class takes, and total minutes alone doesn&rsquo;t say how many
          different subjects a teacher is preparing for.
        </p>
      )}

      {otherTeachers.length > 0 && (
        <div className="field">
          <label htmlFor="teacher-load-viewed">View</label>
          <select
            id="teacher-load-viewed"
            value={viewedTeacherId}
            onChange={(event) => setViewedTeacherId(event.target.value)}
          >
            <option value={teacherUserId}>Myself</option>
            {otherTeachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.displayName}
              </option>
            ))}
          </select>
        </div>
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
        <Loading label="Loading teaching load…" />
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
