import type { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import { SubjectAttendanceScreen } from "./SubjectAttendanceScreen";
import type { TeacherClassWorkContext } from "./work-context";

interface SubjectAttendanceJourneyScreenProps {
  subjectAttendanceService: SubjectAttendanceApplicationService;
  teacherUserId: string;
  initialAssignmentId?: string;
  classContext?: TeacherClassWorkContext | null;
  onBackToClass?: () => void | Promise<void>;
}

/**
 * Golden Journey adapter around the existing Subject Attendance workflow.
 *
 * SubjectAttendanceScreen remains independently usable and continues to own
 * all attendance behavior. This wrapper only adds the bounded navigation
 * affordance needed when attendance was opened from a class workspace.
 */
export function SubjectAttendanceJourneyScreen({
  subjectAttendanceService,
  teacherUserId,
  initialAssignmentId,
  classContext = null,
  onBackToClass,
}: SubjectAttendanceJourneyScreenProps) {
  const canReturnToClass =
    Boolean(classContext) &&
    Boolean(onBackToClass) &&
    classContext?.teachingAssignmentId === initialAssignmentId;

  return (
    <>
      {canReturnToClass ? (
        <div className="journey-context-return">
          <button type="button" onClick={() => void onBackToClass?.()}>
            Back to {classContext?.subjectName} — {classContext?.sectionName}
          </button>
        </div>
      ) : null}
      <SubjectAttendanceScreen
        subjectAttendanceService={subjectAttendanceService}
        teacherUserId={teacherUserId}
        initialAssignmentId={initialAssignmentId}
      />
    </>
  );
}
