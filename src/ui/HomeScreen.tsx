import { useState, type JSX } from "react";
import type { AttendanceApplicationService } from "../application/attendance-service";
import type { AuthApplicationService } from "../application/auth-service";
import type { GradingApplicationService } from "../application/grading-service";
import type { LearnerApplicationService } from "../application/learner-service";
import type { SectionApplicationService } from "../application/section-service";
import type { Sf1ImportApplicationService } from "../application/sf1-import-service";
import { SchoolHeadHome } from "./home/SchoolHeadHome";
import { TeacherWorkspaceScreen } from "./TeacherWorkspaceScreen";

interface HomeScreenProps {
  roles: string[];
  displayName: string;
  schoolName: string;
  attendanceService: AttendanceApplicationService;
  authService: AuthApplicationService;
  gradingService: GradingApplicationService;
  learnerService: LearnerApplicationService;
  sectionService: SectionApplicationService;
  sf1ImportService: Sf1ImportApplicationService;
  onOpenAttendance: (sectionId: string) => void;
  onManageSections: () => void;
  onViewAuditLog: () => void;
  onOpenSf1Import: () => void;
}

/**
 * The role-adaptive Home tab. A plain teacher gets the
 * `TeacherWorkspaceScreen` directly. A school head additionally gets a
 * local, non-persisted view switch between a school-wide overview and
 * that same teaching workspace (school heads commonly also teach).
 */
export function HomeScreen({
  roles,
  displayName,
  schoolName,
  attendanceService,
  authService,
  gradingService,
  learnerService,
  sectionService,
  sf1ImportService,
  onOpenAttendance,
  onManageSections,
  onViewAuditLog,
  onOpenSf1Import,
}: HomeScreenProps): JSX.Element {
  // roles is display-only — see src/domain/session.ts. It only picks
  // which Home layout to render; every command stays gated server-side.
  const isSchoolHead = roles.includes("school_head");
  const [view, setView] = useState<"overview" | "teaching">("overview");

  const workspace = (
    <TeacherWorkspaceScreen
      displayName={displayName}
      attendanceService={attendanceService}
      authService={authService}
      gradingService={gradingService}
      learnerService={learnerService}
      sectionService={sectionService}
      onOpenAttendance={onOpenAttendance}
      onManageSections={onManageSections}
      onViewAuditLog={onViewAuditLog}
    />
  );

  if (!isSchoolHead) {
    return workspace;
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
          sf1ImportService={sf1ImportService}
          onManageSections={onManageSections}
          onOpenSf1Import={onOpenSf1Import}
        />
      ) : (
        workspace
      )}
    </>
  );
}
