import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SchoolMemberApplicationService } from "../application/school-member-service";
import type { TeacherOversightAssignmentApplicationService } from "../application/teacher-oversight-assignment-service";
import { ValidationError } from "../domain/errors";
import type { SchoolMember } from "../domain/school-member";
import type { TeacherOversightAssignment } from "../domain/teacher-oversight-assignment";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { Page } from "./components/Page";
import { useTeacherMode } from "./theme/useTeacherMode";

interface TeacherOversightScreenProps {
  teacherOversightAssignmentService: TeacherOversightAssignmentApplicationService;
  schoolMemberService: SchoolMemberApplicationService;
}

/** A single generic message for every way an assign can fail to actually
 * happen -- a denied capability check, an unknown teacher/Master
 * Teacher, a proposed overseer who doesn't hold the role, a teacher
 * overseeing themselves, and a teacher who already has an active
 * overseer are deliberately distinguished where the outcome tells us,
 * matching `SectionAdviserScreen`'s established per-outcome messaging. */
const GENERIC_END_FAILURE_MESSAGE =
  "Could not end this oversight assignment. It may already be ended, or you may not have permission to change it.";

function todayAsIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * School-Head-only Teacher Oversight Assignment management (ADR-0089,
 * Batch 17 checkpoint 4): shows every currently-active "this Master
 * Teacher oversees this teacher" assignment, with a past-assignments
 * history below for audit purposes, and lets a School Head assign a new
 * overseer or end an existing assignment. Any authenticated school
 * member sees the same list (matching `SectionAdviserScreen`'s
 * established convention of not hiding a screen behind client-side role
 * checks); the backend alone enforces that only a School Head may
 * assign or end an assignment (`ManageTeacherOversightAssignments`) --
 * security must not rely on UI hiding. Reassignment is deliberately
 * explicit end-then-assign, the same convention `SectionAdviserScreen`
 * already established for section advisories.
 */
export function TeacherOversightScreen({
  teacherOversightAssignmentService,
  schoolMemberService,
}: TeacherOversightScreenProps) {
  const { mode } = useTeacherMode();

  const [assignments, setAssignments] = useState<TeacherOversightAssignment[]>([]);
  const [members, setMembers] = useState<SchoolMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const [assignMasterTeacherId, setAssignMasterTeacherId] = useState("");
  const [assignTeacherId, setAssignTeacherId] = useState("");
  const [assignStartsOn, setAssignStartsOn] = useState(todayAsIsoDate);
  const [assigning, setAssigning] = useState(false);

  const [pendingEndId, setPendingEndId] = useState<string | null>(null);
  const [endsOn, setEndsOn] = useState(todayAsIsoDate);
  const [ending, setEnding] = useState(false);

  const requestRef = useRef(0);

  function load() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    Promise.all([
      teacherOversightAssignmentService.listForSchool(),
      schoolMemberService.listMembers(),
    ])
      .then(([assignmentResult, memberResult]) => {
        if (requestRef.current !== requestId) return;
        setAssignments(assignmentResult);
        setMembers(memberResult);
      })
      .catch(() => {
        if (requestRef.current !== requestId) return;
        setLoadError("Could not load teacher oversight assignments.");
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
  }, [teacherOversightAssignmentService, schoolMemberService]);

  function memberName(memberId: string): string {
    return members.find((m) => m.id === memberId)?.displayName ?? memberId;
  }

  const masterTeachers = members.filter((member) => member.roles.includes("master_teacher"));
  const teachers = members.filter((member) => member.roles.includes("teacher"));
  const activeAssignments = assignments.filter((a) => a.endsOn === null);
  const pastAssignments = assignments.filter((a) => a.endsOn !== null);
  // Teachers who already have an active overseer -- excluded from the
  // assign picker to avoid a predictable AlreadyHasAnActiveOverseer
  // rejection; the backend still enforces this structurally regardless.
  const activelyOverseenTeacherIds = new Set(activeAssignments.map((a) => a.teacherUserId));
  const assignableTeachers = teachers.filter((t) => !activelyOverseenTeacherIds.has(t.id));

  async function handleAssign(event: FormEvent) {
    event.preventDefault();
    if (assigning) return;
    setError(null);
    setConfirmation(null);
    setAssigning(true);
    try {
      const outcome = await teacherOversightAssignmentService.assign(
        assignMasterTeacherId,
        assignTeacherId,
        assignStartsOn,
      );
      if (outcome.kind === "assigned") {
        setAssignments((current) => [outcome.assignment, ...current]);
        setConfirmation(
          `${memberName(assignMasterTeacherId)} now oversees ${memberName(assignTeacherId)}.`,
        );
        setAssignTeacherId("");
      } else if (outcome.kind === "alreadyHasAnActiveOverseer") {
        setError("This teacher already has an active overseer — end that assignment first.");
        load();
      } else if (outcome.kind === "notAMasterTeacher") {
        setError(
          "The person you selected does not currently hold the Master Teacher role. Grant that role first, on School Members.",
        );
      } else if (outcome.kind === "cannotOverseeSelf") {
        setError("A teacher cannot be assigned as their own overseer.");
      } else {
        setError(
          "Could not assign this oversight — check that both people are still members of this school, or that you have permission to manage oversight assignments.",
        );
      }
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : "Could not assign this oversight.");
    } finally {
      setAssigning(false);
    }
  }

  function startEnd(assignmentId: string) {
    setError(null);
    setConfirmation(null);
    setEndsOn(todayAsIsoDate());
    setPendingEndId(assignmentId);
  }

  function cancelEnd() {
    setPendingEndId(null);
  }

  async function confirmEnd(assignment: TeacherOversightAssignment) {
    if (ending) return;
    setError(null);
    setConfirmation(null);
    setEnding(true);
    try {
      const outcome = await teacherOversightAssignmentService.end(
        assignment.teacherUserId,
        assignment.id,
        endsOn,
      );
      if (outcome.kind === "ended") {
        setAssignments((current) =>
          current.map((a) => (a.id === outcome.assignment.id ? outcome.assignment : a)),
        );
        setConfirmation(
          `${memberName(assignment.masterTeacherUserId)}'s oversight of ${memberName(assignment.teacherUserId)} was ended.`,
        );
      } else {
        setError(GENERIC_END_FAILURE_MESSAGE);
      }
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : GENERIC_END_FAILURE_MESSAGE);
    } finally {
      setEnding(false);
      setPendingEndId(null);
    }
  }

  return (
    <Page
      title="Teacher Oversight Assignments"
      hint={
        mode === "guided" ? (
          <p className="field-hint">
            Assign a Master Teacher to oversee a teacher, so grade submissions from that teacher are
            reviewed by their Master Teacher first, before your final lock. A teacher with no Master
            Teacher assigned goes straight to you instead — this is expected for a school still
            setting up its Master Teacher hierarchy.
          </p>
        ) : undefined
      }
    >
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
        <Loading label="Loading teacher oversight assignments…" />
      ) : loadError ? null : (
        <>
          <h3>Active assignments</h3>
          {activeAssignments.length === 0 ? (
            <EmptyState>No active oversight assignments yet.</EmptyState>
          ) : (
            <ul className="device-list" aria-label="Active oversight assignments">
              {activeAssignments.map((assignment) => {
                const isPending = pendingEndId === assignment.id;
                return (
                  <li key={assignment.id} className="device-card">
                    <div className="device-card-main">
                      <p className="device-card-name">
                        {memberName(assignment.masterTeacherUserId)} oversees{" "}
                        {memberName(assignment.teacherUserId)}
                      </p>
                      <p className="device-card-detail">Since {assignment.startsOn}</p>
                    </div>
                    {isPending ? (
                      <div
                        className="device-card-confirm"
                        role="group"
                        aria-label={`End this oversight assignment?`}
                      >
                        <div className="field">
                          <label htmlFor={`ends-on-${assignment.id}`}>End date</label>
                          <input
                            id={`ends-on-${assignment.id}`}
                            type="date"
                            value={endsOn}
                            onChange={(event) => setEndsOn(event.target.value)}
                            disabled={ending}
                            required
                          />
                        </div>
                        <div className="device-card-confirm-actions">
                          <button type="button" onClick={cancelEnd} aria-disabled={ending}>
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="button-danger"
                            onClick={() => confirmEnd(assignment)}
                            aria-disabled={ending}
                          >
                            {ending ? "Ending…" : "Yes, end this assignment"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="button-danger-secondary"
                        onClick={() => startEnd(assignment.id)}
                      >
                        End assignment
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <form onSubmit={handleAssign} aria-label="Assign a new oversight">
            <h3>Assign a Master Teacher</h3>
            {masterTeachers.length === 0 ? (
              <p className="field-hint">
                No school members hold the Master Teacher role yet — grant it first, on School
                Members.
              </p>
            ) : assignableTeachers.length === 0 ? (
              <p className="field-hint">
                Every teacher already has an active overseer, or no teachers are members of this
                school yet.
              </p>
            ) : (
              <div className="form-row">
                <div className="field">
                  <label htmlFor="oversight-master-teacher">Master Teacher</label>
                  <select
                    id="oversight-master-teacher"
                    value={assignMasterTeacherId}
                    onChange={(event) => setAssignMasterTeacherId(event.target.value)}
                    required
                  >
                    <option value="" disabled>
                      Select a Master Teacher
                    </option>
                    {masterTeachers.map((mt) => (
                      <option key={mt.id} value={mt.id}>
                        {mt.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="oversight-teacher">Teacher</label>
                  <select
                    id="oversight-teacher"
                    value={assignTeacherId}
                    onChange={(event) => setAssignTeacherId(event.target.value)}
                    required
                  >
                    <option value="" disabled>
                      Select a teacher
                    </option>
                    {assignableTeachers.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="oversight-starts-on">Start date</label>
                  <input
                    id="oversight-starts-on"
                    type="date"
                    value={assignStartsOn}
                    onChange={(event) => setAssignStartsOn(event.target.value)}
                    required
                  />
                </div>
              </div>
            )}
            <button
              type="submit"
              className="button-primary"
              aria-disabled={
                assigning ||
                masterTeachers.length === 0 ||
                assignableTeachers.length === 0 ||
                !assignMasterTeacherId ||
                !assignTeacherId
              }
            >
              {assigning ? "Assigning…" : "Assign oversight"}
            </button>
          </form>

          <h3>Assignment history</h3>
          {pastAssignments.length === 0 ? (
            <EmptyState>No ended oversight assignments yet.</EmptyState>
          ) : (
            <ul className="device-list" aria-label="Past oversight assignments">
              {pastAssignments.map((assignment) => (
                <li key={assignment.id} className="device-card">
                  <div className="device-card-main">
                    <p className="device-card-name">
                      {memberName(assignment.masterTeacherUserId)} oversaw{" "}
                      {memberName(assignment.teacherUserId)}
                    </p>
                    <p className="device-card-detail">
                      {assignment.startsOn} to {assignment.endsOn}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Page>
  );
}
