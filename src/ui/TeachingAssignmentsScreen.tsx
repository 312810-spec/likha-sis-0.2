import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SchoolMemberApplicationService } from "../application/school-member-service";
import type { SubjectApplicationService } from "../application/subject-service";
import type { TeachingAssignmentApplicationService } from "../application/teaching-assignment-service";
import { ValidationError } from "../domain/errors";
import type { SchoolMember } from "../domain/school-member";
import type { Subject } from "../domain/subject";
import type { TeachingAssignmentDetail } from "../domain/teaching-assignment";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { useTeacherMode } from "./theme/useTeacherMode";

interface TeachingAssignmentsScreenProps {
  teachingAssignmentService: TeachingAssignmentApplicationService;
  subjectService: SubjectApplicationService;
  schoolMemberService: SchoolMemberApplicationService;
  /** The section to manage assignments for. Supplied by the Sections
   * workflow (App.tsx state handoff), never a URL/route param -- the
   * same narrowly-typed pattern `AttendanceScreen`'s `initialSectionId`
   * and `SectionRosterScreen`'s `sectionId` already use. `sectionName`
   * comes from the same handoff, since `SectionsScreen` already has the
   * full `Section` in hand when the teacher chooses this action -- no
   * second lookup needed just to show a heading. */
  sectionId: string;
  sectionName: string;
  onBack: () => void;
}

/** Wave 2Y: a School Head assigns and unassigns which teacher teaches a
 * subject for this section. Reassignment is deliberately explicit
 * remove-then-create, not a one-step "replace" -- see
 * `docs/adr/0039-teacher-load-class-schedule-foundation.md`'s own
 * reasoning and the Wave 2Y addendum to `docs/adr/0055-*`. Any
 * authenticated school member may view this screen (matching
 * `list_teaching_assignments_by_section`'s reference-data convention);
 * the backend alone enforces that only a School Head may create or
 * remove -- security must not rely on UI hiding, so this screen shows
 * the same form to everyone and surfaces a generic error if the
 * backend declines, the same convention `SectionsScreen`'s own
 * "Create a section" form already uses. */
export function TeachingAssignmentsScreen({
  teachingAssignmentService,
  subjectService,
  schoolMemberService,
  sectionId,
  sectionName,
  onBack,
}: TeachingAssignmentsScreenProps) {
  const { mode } = useTeacherMode();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [assignments, setAssignments] = useState<TeachingAssignmentDetail[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [members, setMembers] = useState<SchoolMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const [assignSubjectId, setAssignSubjectId] = useState("");
  const [assignTeacherId, setAssignTeacherId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const requestRef = useRef(0);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  function load() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    Promise.all([
      teachingAssignmentService.listBySection(sectionId),
      subjectService.listSubjects(),
      schoolMemberService.listMembers(),
    ])
      .then(([assignmentResult, subjectResult, memberResult]) => {
        if (requestRef.current !== requestId) return;
        setAssignments(assignmentResult);
        setSubjects(subjectResult);
        setMembers(memberResult);
      })
      .catch(() => {
        if (requestRef.current !== requestId) return;
        setLoadError("Could not load teaching assignments for this section.");
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
  }, [teachingAssignmentService, subjectService, schoolMemberService, sectionId]);

  const teachers = members.filter((member) => member.roles.includes("teacher"));

  function teacherName(teacherUserId: string): string {
    return members.find((member) => member.id === teacherUserId)?.displayName ?? teacherUserId;
  }

  async function handleAssign(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setConfirmation(null);
    setAssigning(true);
    try {
      const created = await teachingAssignmentService.create(
        assignTeacherId,
        sectionId,
        assignSubjectId,
      );
      if (created === null) {
        setError(
          "Could not assign this teacher — check that the teacher and subject are still valid, or that you have permission to manage teaching assignments.",
        );
      } else {
        setConfirmation("Teacher assigned.");
        setAssignSubjectId("");
        setAssignTeacherId("");
        load();
      }
    } catch (err) {
      setError(
        err instanceof ValidationError
          ? err.message
          : "Could not assign this teacher — this subject may already have a teacher for this section.",
      );
    } finally {
      setAssigning(false);
    }
  }

  async function handleRemove(assignment: TeachingAssignmentDetail) {
    setError(null);
    setConfirmation(null);
    setRemovingId(assignment.id);
    try {
      const removed = await teachingAssignmentService.remove(assignment.id);
      if (removed) {
        setAssignments((current) => current.filter((a) => a.id !== assignment.id));
        setConfirmation(
          `${teacherName(assignment.teacherUserId)} was unassigned from ${assignment.subjectName}.`,
        );
      } else {
        setError("Could not remove this assignment.");
      }
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : "Could not remove this assignment.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <section aria-label="Teaching Assignments">
      <button type="button" className="section-roster-back" onClick={onBack}>
        <span aria-hidden="true">← </span>Back to sections
      </button>
      <h2 ref={headingRef} tabIndex={-1}>
        {sectionName} — teaching assignments
      </h2>
      {mode === "guided" && (
        <p className="field-hint">
          Assign one teacher per subject for this section. To change who teaches a subject, remove
          the current assignment first, then assign the new teacher.
        </p>
      )}

      {loadError && (
        <Alert tone="error">
          <p>{loadError}</p>
          <button type="button" onClick={load}>
            Retry
          </button>
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {confirmation && <Alert tone="success">{confirmation}</Alert>}

      {loading ? (
        <Loading label="Loading teaching assignments…" />
      ) : loadError ? null : (
        <>
          {assignments.length === 0 ? (
            <EmptyState>No teacher has been assigned to this section yet.</EmptyState>
          ) : (
            <table className="attendance-roster">
              <thead>
                <tr>
                  <th scope="col">Subject</th>
                  <th scope="col">Teacher</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((assignment) => (
                  <tr key={assignment.id}>
                    <th scope="row">{assignment.subjectName}</th>
                    <td>{teacherName(assignment.teacherUserId)}</td>
                    <td>
                      <button
                        type="button"
                        disabled={removingId === assignment.id}
                        onClick={() => handleRemove(assignment)}
                        aria-label={`Remove ${teacherName(assignment.teacherUserId)} from ${assignment.subjectName}`}
                      >
                        {removingId === assignment.id ? "Removing…" : "Remove"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <form onSubmit={handleAssign} aria-label="Assign a teacher">
            <h3>Assign a teacher</h3>
            {subjects.length === 0 ? (
              <p className="field-hint">No subjects exist yet — create one first.</p>
            ) : teachers.length === 0 ? (
              <p className="field-hint">No teachers are members of this school yet.</p>
            ) : (
              <div className="form-row">
                <div className="field">
                  <label htmlFor="assignment-subject">Subject</label>
                  <select
                    id="assignment-subject"
                    value={assignSubjectId}
                    onChange={(event) => setAssignSubjectId(event.target.value)}
                    required
                  >
                    <option value="" disabled>
                      Select a subject
                    </option>
                    {subjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="assignment-teacher">Teacher</label>
                  <select
                    id="assignment-teacher"
                    value={assignTeacherId}
                    onChange={(event) => setAssignTeacherId(event.target.value)}
                    required
                  >
                    <option value="" disabled>
                      Select a teacher
                    </option>
                    {teachers.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.displayName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            <button
              type="submit"
              className="button-primary"
              disabled={assigning || subjects.length === 0 || teachers.length === 0}
            >
              {assigning ? "Assigning…" : "Assign teacher"}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
