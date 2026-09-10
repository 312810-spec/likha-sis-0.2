import { useState, type JSX } from "react";
import type { AttendanceApplicationService } from "../application/attendance-service";
import type { AuthApplicationService } from "../application/auth-service";
import type { GradingApplicationService } from "../application/grading-service";
import type { LearnerApplicationService } from "../application/learner-service";
import type { SchoolAttendanceApplicationService } from "../application/school-attendance-service";
import type { SchoolMemberApplicationService } from "../application/school-member-service";
import type { SectionAdvisoryApplicationService } from "../application/section-advisory-service";
import type { SectionApplicationService } from "../application/section-service";
import type { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import type { SyncStatusApplicationService } from "../application/sync-status-service";
import type { TeachingAssignmentApplicationService } from "../application/teaching-assignment-service";
import { SchoolHeadHome } from "./home/SchoolHeadHome";
import { TeacherHome } from "./home/TeacherHome";

interface HomeScreenProps {
  roles: string[];
  displayName: string;
  username: string;
  userId: string;
  schoolName: string;
  attendanceService: AttendanceApplicationService;
  authService: AuthApplicationService;
  gradingService: GradingApplicationService;
  learnerService: LearnerApplicationService;
  sectionService: SectionApplicationService;
  subjectAttendanceService: SubjectAttendanceApplicationService;
  syncStatusService: SyncStatusApplicationService;
  schoolAttendanceService: SchoolAttendanceApplicationService;
  sectionAdvisoryService: SectionAdvisoryApplicationService;
  schoolMemberService: SchoolMemberApplicationService;
  teachingAssignmentService: TeachingAssignmentApplicationService;
  onOpenAttendance: (sectionId: string) => void;
  onOpenSubjectAttendance: (teachingAssignmentId: string) => void;
  onManageSections: () => void;
  onOpenClassRecords: () => void;
  onViewSyncStatus: () => void;
  onViewTeacherLoad: () => void;
  onOpenSf1Import: () => void;
}

/**
 * The role-adaptive Home tab. A plain teacher gets `TeacherHome`
 * directly. A school head additionally gets a local, non-persisted view
 * switch between a school-wide overview and that same teaching Home
 * (school heads commonly also teach).
 */
export function HomeScreen({
  roles,
  displayName,
  username,
  userId,
  schoolName,
  attendanceService,
  authService,
  gradingService,
  learnerService,
  sectionService,
  subjectAttendanceService,
  syncStatusService,
  schoolAttendanceService,
  sectionAdvisoryService,
  schoolMemberService,
  teachingAssignmentService,
  onOpenAttendance,
  onOpenSubjectAttendance,
  onManageSections,
  onOpenClassRecords,
  onViewSyncStatus,
  onViewTeacherLoad,
  onOpenSf1Import,
}: HomeScreenProps): JSX.Element {
  // roles is display-only — see src/domain/session.ts. It only picks
  // which Home layout to render; every command stays gated server-side.
  const isSchoolHead = roles.includes("school_head");
  const [view, setView] = useState<"overview" | "teaching">("overview");

  const teaching = (
    <TeacherHome
      displayName={displayName}
      username={username}
      teacherUserId={userId}
      attendanceService={attendanceService}
      authService={authService}
      gradingService={gradingService}
      sectionService={sectionService}
      subjectAttendanceService={subjectAttendanceService}
      syncStatusService={syncStatusService}
      onOpenAttendance={onOpenAttendance}
      onOpenSubjectAttendance={onOpenSubjectAttendance}
      onManageSections={onManageSections}
      onOpenClassRecords={onOpenClassRecords}
      onViewSyncStatus={onViewSyncStatus}
    />
  );

  if (!isSchoolHead) {
    return teaching;
  }

  return (
    <>
      <div className="home-view-toggle" role="group" aria-label="Home view">
        <button
          type="button"
          aria-pressed={view === "overview"}
          onClick={() => setView("overview")}
        >
          School overview
        </button>
        <button
          type="button"
          aria-pressed={view === "teaching"}
          onClick={() => setView("teaching")}
        >
          My teaching
        </button>
      </div>
      {view === "overview" ? (
        <SchoolHeadHome
          schoolName={schoolName}
          sectionService={sectionService}
          learnerService={learnerService}
          schoolAttendanceService={schoolAttendanceService}
          sectionAdvisoryService={sectionAdvisoryService}
          schoolMemberService={schoolMemberService}
          teachingAssignmentService={teachingAssignmentService}
          onManageSections={onManageSections}
          onOpenSf1Import={onOpenSf1Import}
          onViewTeacherLoad={onViewTeacherLoad}
        />
      ) : (
        teaching
      )}
    </>
  );
}
