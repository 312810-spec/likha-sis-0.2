import type { TeacherClassWorkContext } from "./work-context";
import { Page } from "./components/Page";
import { useTeacherMode } from "./theme/useTeacherMode";

interface ClassWorkspaceScreenProps {
  context: TeacherClassWorkContext;
  onCheckAttendance: (teachingAssignmentId: string) => void;
  onOpenClassRecords: (teachingAssignmentId: string) => void;
  onBackToToday: () => void;
}

/**
 * Legacy Soul class workspace rooted in one preserved teaching assignment.
 * Connected tools keep their existing application/domain ownership; this
 * screen only carries the teacher into them without asking for the class again.
 */
export function ClassWorkspaceScreen({
  context,
  onCheckAttendance,
  onOpenClassRecords,
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
        <p>Continue the class workflow without selecting this class again.</p>
        <div className="button-row">
          <button
            type="button"
            className="button-primary"
            onClick={() => onCheckAttendance(context.teachingAssignmentId)}
          >
            Check attendance
          </button>
          <button
            type="button"
            onClick={() => onOpenClassRecords(context.teachingAssignmentId)}
          >
            Open class record
          </button>
        </div>
      </section>
    </Page>
  );
}
