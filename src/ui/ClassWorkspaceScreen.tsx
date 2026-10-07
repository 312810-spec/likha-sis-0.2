import type { TeacherClassWorkContext } from "./work-context";
import { Page } from "./components/Page";
import { useTeacherMode } from "./theme/useTeacherMode";

interface ClassWorkspaceScreenProps {
  context: TeacherClassWorkContext;
  onCheckAttendance: (teachingAssignmentId: string) => void;
  onOpenClassRecord: (teachingAssignmentId: string) => void;
  /** Opens Classroom Mode -- CTOS.md §6.3's teaching cockpit -- for this
   * class, today. Same narrow callback shape as the two above. */
  onStartClassroom: (teachingAssignmentId: string) => void;
  onBackToToday: () => void;
}

/**
 * First Legacy Soul class workspace slice.
 *
 * The workspace is deliberately small: it proves that a teacher can enter a
 * class once from Today and carry that context into real work. It does not
 * duplicate attendance/class-record domain state and it does not expose
 * placeholder controls for features that have not yet been integrated.
 */
export function ClassWorkspaceScreen({
  context,
  onCheckAttendance,
  onOpenClassRecord,
  onStartClassroom,
  onBackToToday,
}: ClassWorkspaceScreenProps) {
  const { mode } = useTeacherMode();
  const scheduleLabel =
    context.startsAt && context.endsAt
      ? `${context.startsAt}–${context.endsAt}${context.room ? ` · ${context.room}` : ""}`
      : null;

  return (
    <Page
      title={`${context.subjectName} — ${context.sectionName}`}
      actions={
        <button type="button" onClick={onBackToToday}>
          Back to Today
        </button>
      }
      hint={
        mode === "guided" ? (
          <p className="field-hint">
            You are working inside this class. LIKHA will keep the class context while you move
            through its connected work.
          </p>
        ) : undefined
      }
    >
      {scheduleLabel ? (
        <p className="field-hint" aria-label="Selected class schedule">
          {scheduleLabel}
        </p>
      ) : null}

      <section aria-labelledby="class-workspace-work">
        <h3 id="class-workspace-work">Class work</h3>
        <div className="class-work-actions">
          <div className="class-work-row">
            <div>
              <h4>Classroom</h4>
              <p>Start the session, capture evidence, then finish the class.</p>
            </div>
            <button
              type="button"
              className="button-primary"
              onClick={() => onStartClassroom(context.teachingAssignmentId)}
            >
              Start class
            </button>
          </div>
          <div className="class-work-row">
            <div>
              <h4>Attendance</h4>
              <p>Check learners for this class meeting.</p>
            </div>
            <button
              type="button"
              className="button-primary"
              onClick={() => onCheckAttendance(context.teachingAssignmentId)}
            >
              Check attendance
            </button>
          </div>
          <div className="class-work-row">
            <div>
              <h4>Class record</h4>
              <p>Assessments, learner scores, and grades.</p>
            </div>
            <button type="button" onClick={() => onOpenClassRecord(context.teachingAssignmentId)}>
              Open class record
            </button>
          </div>
        </div>
      </section>
    </Page>
  );
}
