import { useState } from "react";
import type { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import { ClassLearnersPanel } from "./ClassLearnersPanel";
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
 * all attendance behavior. When attendance was opened from a preserved class
 * context, this wrapper also exposes the next Golden Journey step: an
 * assignment-owned learner roster that cannot broaden access through a raw
 * section id.
 */
export function SubjectAttendanceJourneyScreen({
  subjectAttendanceService,
  teacherUserId,
  initialAssignmentId,
  classContext = null,
  onBackToClass,
}: SubjectAttendanceJourneyScreenProps) {
  const [showLearners, setShowLearners] = useState(false);
  const hasMatchingClassContext =
    Boolean(classContext) && classContext?.teachingAssignmentId === initialAssignmentId;
  const canReturnToClass = hasMatchingClassContext && Boolean(onBackToClass);

  return (
    <>
      {hasMatchingClassContext ? (
        <div className="journey-context-return">
          {canReturnToClass ? (
            <button type="button" onClick={() => void onBackToClass?.()}>
              Back to {classContext?.subjectName} — {classContext?.sectionName}
            </button>
          ) : null}
          <button type="button" onClick={() => setShowLearners((current) => !current)}>
            {showLearners ? "Hide class learners" : `View ${classContext?.subjectName} learners`}
          </button>
        </div>
      ) : null}

      {showLearners && classContext ? (
        <ClassLearnersPanel
          subjectAttendanceService={subjectAttendanceService}
          teachingAssignmentId={classContext.teachingAssignmentId}
        />
      ) : null}

      <SubjectAttendanceScreen
        subjectAttendanceService={subjectAttendanceService}
        teacherUserId={teacherUserId}
        initialAssignmentId={initialAssignmentId}
      />
    </>
  );
}
