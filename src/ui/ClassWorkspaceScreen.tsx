import { useState } from "react";
import type { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import { ClassLearnersPanel } from "./ClassLearnersPanel";
import type { TeacherClassWorkContext } from "./work-context";
import { Page } from "./components/Page";
import { useTeacherMode } from "./theme/useTeacherMode";

interface ClassWorkspaceScreenProps {
  context: TeacherClassWorkContext;
  subjectAttendanceService: SubjectAttendanceApplicationService;
  onCheckAttendance: (teachingAssignmentId: string) => void;
  onBackToToday: () => void;
}

/**
 * Golden Journey class workspace rooted in one teaching assignment.
 *
 * Connected work is added here only when its trusted authorization path and
 * existing behavior can be preserved. Attendance remains its own workflow;
 * Learners uses the assignment-owned Subject Attendance monitor as a scoped
 * roster read so the workspace never broadens access merely because it knows
 * a section label/id.
 */
export function ClassWorkspaceScreen({
  context,
  subjectAttendanceService,
  onCheckAttendance,
  onBackToToday,
}: ClassWorkspaceScreenProps) {
  const { mode } = useTeacherMode();
  const [showLearners, setShowLearners] = useState(false);
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
        <p>Choose the next task without selecting this class again.</p>
        <div className="button-row">
          <button
            type="button"
            className="button-primary"
            onClick={() => onCheckAttendance(context.teachingAssignmentId)}
          >
            Check attendance
          </button>
          <button type="button" onClick={() => setShowLearners((current) => !current)}>
            {showLearners ? "Hide learners" : "View learners"}
          </button>
        </div>
      </section>

      {showLearners ? (
        <ClassLearnersPanel
          subjectAttendanceService={subjectAttendanceService}
          teachingAssignmentId={context.teachingAssignmentId}
        />
      ) : null}
    </Page>
  );
}
