import type { TeacherClassWorkContext } from "./work-context";
import { Page } from "./components/Page";
import { useTeacherMode } from "./theme/useTeacherMode";

interface ClassWorkspaceScreenProps {
  context: TeacherClassWorkContext;
  onCheckAttendance: (teachingAssignmentId: string) => void;
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
        <p>
          Start with attendance. More class tools will move into this same workspace only after
          their existing behavior is preserved and verified.
        </p>
        <button
          type="button"
          className="button-primary"
          onClick={() => onCheckAttendance(context.teachingAssignmentId)}
        >
          Check attendance
        </button>
      </section>
    </Page>
  );
}
