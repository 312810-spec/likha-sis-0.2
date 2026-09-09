import { useEffect, useRef, useState } from "react";
import type { ClassRecordApplicationService } from "../application/class-record-service";
import type { GradeSubmissionApplicationService } from "../application/grade-submission-service";
import type { SchoolMemberApplicationService } from "../application/school-member-service";
import type { TeacherOversightAssignmentApplicationService } from "../application/teacher-oversight-assignment-service";
import type { ClassRecordDetail } from "../domain/class-record";
import { ValidationError } from "../domain/errors";
import { reviewStageFor, type GradeSubmission, type ReviewStage } from "../domain/grade-submission";
import type { SchoolMember } from "../domain/school-member";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { Page } from "./components/Page";
import { useTeacherMode } from "./theme/useTeacherMode";

interface GradeReviewScreenProps {
  gradeSubmissionService: GradeSubmissionApplicationService;
  teacherOversightAssignmentService: TeacherOversightAssignmentApplicationService;
  classRecordService: ClassRecordApplicationService;
  schoolMemberService: SchoolMemberApplicationService;
  /** Display-only, matching `CurrentSession.roles`'s own contract --
   * used only to decide which read to attempt and which decision action
   * to render, never as the real authorization boundary. The backend
   * alone enforces `authorize_grade_submission_master_teacher_decision`/
   * `ManageGradeSubmissionReview` regardless of what this screen shows. */
  roles: string[];
  userId: string;
}

const STAGE_LABEL: Record<ReviewStage, string> = {
  awaiting_master_teacher: "Awaiting Master Teacher review",
  awaiting_school_head: "Awaiting School Head final lock",
  approved: "Approved",
  rejected_by_master_teacher: "Rejected by Master Teacher",
  rejected_by_school_head: "Rejected by School Head",
};

const GENERIC_DECIDE_FAILURE_MESSAGE =
  "Could not record this decision. The submission may already have been decided, or you may not have permission to decide it.";

function todayAsIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function classRecordLabel(classRecordId: string, classRecords: ClassRecordDetail[]): string {
  const record = classRecords.find((cr) => cr.id === classRecordId);
  if (!record) return classRecordId;
  return `${record.subjectName} — ${record.sectionName} (${record.gradingPeriodLabel})`;
}

function memberName(userIdToFind: string | null, members: SchoolMember[]): string {
  if (!userIdToFind) return "Unknown";
  return members.find((m) => m.id === userIdToFind)?.displayName ?? userIdToFind;
}

/**
 * The two-tier grade-review screen (ADR-0089, Batch 17 checkpoint 4):
 * shows every grade submission relevant to the signed-in user (a School
 * Head's full submission-status matrix, a Master Teacher's own review
 * queue of the teachers they currently oversee -- both, if someone
 * happens to hold both roles) with the current review stage explicitly
 * labeled, including which tier a rejection happened at.
 *
 * Which decision action a row offers is derived purely from
 * `reviewStageFor` (client-side display logic mirroring
 * `commands::grade_submission::require_no_pending_master_teacher_decision`
 * exactly) plus whether the signed-in user is this teacher's own current
 * overseer -- never a client-side guess at what the backend will allow
 * that could drift from it. This is a display convenience only:
 * `decideMasterTeacher`/`decideSchoolHead` re-verify the exact same
 * authorization server-side regardless of what button this screen shows.
 */
export function GradeReviewScreen({
  gradeSubmissionService,
  teacherOversightAssignmentService,
  classRecordService,
  schoolMemberService,
  roles,
  userId,
}: GradeReviewScreenProps) {
  const { mode } = useTeacherMode();
  const isSchoolHead = roles.includes("school_head");
  const isMasterTeacher = roles.includes("master_teacher");
  const [todayIso] = useState(todayAsIsoDate);

  const [submissions, setSubmissions] = useState<GradeSubmission[]>([]);
  const [classRecords, setClassRecords] = useState<ClassRecordDetail[]>([]);
  const [members, setMembers] = useState<SchoolMember[]>([]);
  // Which submitter currently has which Master Teacher overseer, keyed
  // by submitter userId -- resolved once per load, not per row render.
  const [overseerBySubmitter, setOverseerBySubmitter] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [feedbackNote, setFeedbackNote] = useState("");

  const [expandedNotesId, setExpandedNotesId] = useState<string | null>(null);
  const [notesById, setNotesById] = useState<Record<string, string[]>>({});
  const [notesLoading, setNotesLoading] = useState(false);

  const requestRef = useRef(0);

  function load() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError(null);

    const submissionReads: Promise<GradeSubmission[]>[] = [];
    if (isSchoolHead) submissionReads.push(gradeSubmissionService.listForSchool());
    if (isMasterTeacher)
      submissionReads.push(gradeSubmissionService.listForMasterTeacher(todayIso));

    Promise.all([
      Promise.all(submissionReads),
      classRecordService.listClassRecords(),
      schoolMemberService.listMembers(),
    ])
      .then(async ([submissionLists, classRecordResult, memberResult]) => {
        if (requestRef.current !== requestId) return;
        const merged = new Map<string, GradeSubmission>();
        for (const list of submissionLists) {
          for (const submission of list) merged.set(submission.id, submission);
        }
        const mergedList = [...merged.values()].sort((a, b) =>
          b.submittedAt.localeCompare(a.submittedAt),
        );

        const submitterIds = [
          ...new Set(
            mergedList.map((s) => s.submittedByUserId).filter((id): id is string => id !== null),
          ),
        ];
        const overseerChecks = await Promise.all(
          submitterIds.map((submitterId) =>
            teacherOversightAssignmentService
              .currentOverseer(submitterId, todayIso)
              .then((overseer) => [submitterId, overseer?.masterTeacherUserId ?? null] as const)
              .catch(() => [submitterId, null] as const),
          ),
        );

        if (requestRef.current !== requestId) return;
        setSubmissions(mergedList);
        setClassRecords(classRecordResult);
        setMembers(memberResult);
        setOverseerBySubmitter(Object.fromEntries(overseerChecks));
      })
      .catch(() => {
        if (requestRef.current !== requestId) return;
        setLoadError("Could not load grade submissions for review.");
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
  }, [
    gradeSubmissionService,
    teacherOversightAssignmentService,
    classRecordService,
    schoolMemberService,
    isSchoolHead,
    isMasterTeacher,
  ]);

  function startDecide(submissionId: string) {
    setError(null);
    setConfirmation(null);
    setFeedbackNote("");
    setDecidingId(submissionId);
  }

  function cancelDecide() {
    setDecidingId(null);
    setFeedbackNote("");
  }

  async function handleDecide(
    submission: GradeSubmission,
    tier: "masterTeacher" | "schoolHead",
    approve: boolean,
  ) {
    setError(null);
    setConfirmation(null);
    try {
      const decided =
        tier === "masterTeacher"
          ? await gradeSubmissionService.decideMasterTeacher(
              submission.id,
              approve,
              feedbackNote,
              todayIso,
            )
          : await gradeSubmissionService.decideSchoolHead(
              submission.id,
              approve,
              feedbackNote,
              todayIso,
            );
      setSubmissions((current) => current.map((s) => (s.id === decided.id ? decided : s)));
      setConfirmation(
        approve
          ? "The submission was approved."
          : "The submission was rejected, and the teacher will see the feedback note.",
      );
      setDecidingId(null);
      setFeedbackNote("");
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : GENERIC_DECIDE_FAILURE_MESSAGE);
    }
  }

  async function toggleNotes(submissionId: string) {
    if (expandedNotesId === submissionId) {
      setExpandedNotesId(null);
      return;
    }
    setExpandedNotesId(submissionId);
    if (notesById[submissionId]) return;
    setNotesLoading(true);
    try {
      const notes = await gradeSubmissionService.listNotes(submissionId);
      setNotesById((current) => ({
        ...current,
        [submissionId]: notes.map((n) => n.note),
      }));
    } catch {
      setNotesById((current) => ({ ...current, [submissionId]: [] }));
    } finally {
      setNotesLoading(false);
    }
  }

  const hasAnyAccess = isSchoolHead || isMasterTeacher;

  return (
    <Page
      title="Grade Review"
      hint={
        mode === "guided" ? (
          <p className="field-hint">
            Grade submissions go through up to two review steps: the teacher&rsquo;s assigned Master
            Teacher decides first, then School Head performs a separate final lock. A teacher with
            no Master Teacher assigned goes straight to School Head.
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

      {!hasAnyAccess ? (
        <EmptyState>
          You do not hold School Head or Master Teacher access, so there is nothing to review here.
        </EmptyState>
      ) : loading ? (
        <Loading label="Loading grade submissions…" />
      ) : loadError ? null : submissions.length === 0 ? (
        <EmptyState>No grade submissions to review right now.</EmptyState>
      ) : (
        <ul className="device-list" aria-label="Grade submissions">
          {submissions.map((submission) => {
            const overseerId = submission.submittedByUserId
              ? (overseerBySubmitter[submission.submittedByUserId] ?? null)
              : null;
            const stage = reviewStageFor(submission, overseerId !== null);
            const isDeciding = decidingId === submission.id;
            const canDecideAsMasterTeacher =
              isMasterTeacher && stage === "awaiting_master_teacher" && overseerId === userId;
            const canDecideAsSchoolHead = isSchoolHead && stage === "awaiting_school_head";
            const notesExpanded = expandedNotesId === submission.id;

            return (
              <li key={submission.id} className="device-card">
                <div className="device-card-main">
                  <p className="device-card-name">
                    {classRecordLabel(submission.classRecordId, classRecords)}
                  </p>
                  <p className="device-card-detail">
                    Submitted by {memberName(submission.submittedByUserId, members)} on{" "}
                    {formatWhen(submission.submittedAt)}
                  </p>
                  <p className="device-card-detail">
                    <strong>{STAGE_LABEL[stage]}</strong>
                  </p>
                  <button type="button" onClick={() => toggleNotes(submission.id)}>
                    {notesExpanded ? "Hide notes" : "View notes"}
                  </button>
                  {notesExpanded && (
                    <div className="device-card-detail">
                      {notesLoading && !notesById[submission.id] ? (
                        <Loading label="Loading notes…" />
                      ) : (notesById[submission.id]?.length ?? 0) === 0 ? (
                        <p className="field-hint">No notes recorded.</p>
                      ) : (
                        <ul aria-label={`Notes for this submission`}>
                          {notesById[submission.id]!.map((note, index) => (
                            <li key={index}>{note}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                {canDecideAsMasterTeacher || canDecideAsSchoolHead ? (
                  isDeciding ? (
                    <div
                      className="device-card-confirm"
                      role="group"
                      aria-label={`Decide this submission?`}
                    >
                      <div className="field">
                        <label htmlFor={`feedback-${submission.id}`}>
                          Feedback note (optional)
                        </label>
                        <textarea
                          id={`feedback-${submission.id}`}
                          value={feedbackNote}
                          onChange={(event) => setFeedbackNote(event.target.value)}
                        />
                      </div>
                      <div className="device-card-confirm-actions">
                        <button type="button" onClick={cancelDecide}>
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="button-danger"
                          onClick={() =>
                            handleDecide(
                              submission,
                              canDecideAsMasterTeacher ? "masterTeacher" : "schoolHead",
                              false,
                            )
                          }
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          className="button-primary"
                          onClick={() =>
                            handleDecide(
                              submission,
                              canDecideAsMasterTeacher ? "masterTeacher" : "schoolHead",
                              true,
                            )
                          }
                        >
                          {canDecideAsMasterTeacher
                            ? "Approve (Master Teacher)"
                            : "Approve (final lock)"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => startDecide(submission.id)}>
                      {canDecideAsMasterTeacher
                        ? "Decide as Master Teacher"
                        : "Final lock decision"}
                    </button>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
