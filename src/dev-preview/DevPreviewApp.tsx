import { useState } from "react";
import { AssessmentApplicationService } from "../application/assessment-service";
import { AttendanceApplicationService } from "../application/attendance-service";
import { AuthApplicationService } from "../application/auth-service";
import { ClassRecordApplicationService } from "../application/class-record-service";
import { ExportApplicationService } from "../application/export-service";
import { EnrollmentHistoryApplicationService } from "../application/enrollment-history-service";
import { GradingApplicationService } from "../application/grading-service";
import { LearnerApplicationService } from "../application/learner-service";
import { LearnerScoreApplicationService } from "../application/learner-score-service";
import { SchoolMemberApplicationService } from "../application/school-member-service";
import { SectionAdvisoryApplicationService } from "../application/section-advisory-service";
import { SectionApplicationService } from "../application/section-service";
import { SubjectApplicationService } from "../application/subject-service";
import { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import { TeachingAssignmentApplicationService } from "../application/teaching-assignment-service";
import { AppShell } from "../ui/AppShell";
import { AdviserViewScreen } from "../ui/AdviserViewScreen";
import { AttendanceScreen } from "../ui/AttendanceScreen";
import { AuditLogScreen } from "../ui/AuditLogScreen";
import { ClassRecordsScreen } from "../ui/ClassRecordsScreen";
import { MonthlySummaryScreen } from "../ui/MonthlySummaryScreen";
import { LearnerListScreen } from "../ui/LearnerListScreen";
import { ScheduleMeetingsScreen } from "../ui/ScheduleMeetingsScreen";
import { SectionsScreen } from "../ui/SectionsScreen";
import { SubjectMonitorScreen } from "../ui/SubjectMonitorScreen";
import { TeacherLoadScreen } from "../ui/TeacherLoadScreen";
import { TeacherWorkspaceScreen } from "../ui/TeacherWorkspaceScreen";
import { TeachingAssignmentsScreen } from "../ui/TeachingAssignmentsScreen";
import { WorkbenchNav } from "../ui/components/WorkbenchNav";
import type { SignedInTab } from "../ui/components/workbench-nav-data";
import { ModeProvider } from "../ui/theme/ModeContext";
import "../ui/theme/styles.css";
import {
  FIXTURE_SESSION,
  FixtureAssessmentRepository,
  FixtureAttendanceRepository,
  FixtureAuthRepository,
  FixtureClassRecordRepository,
  FixtureExportRepository,
  FixtureEnrollmentHistoryRepository,
  FixtureGradingRepository,
  FixtureLearnerRepository,
  FixtureLearnerScoreRepository,
  FixtureSchoolMemberRepository,
  FixtureSectionAdvisoryRepository,
  FixtureSectionRepository,
  FixtureSubjectAttendanceRepository,
  FixtureSubjectRepository,
  FixtureTeachingAssignmentRepository,
} from "./fixtures";

/**
 * Development-only visual fixture. See `docs/adr/0032-teacher-workspace-polish.md`
 * for the full safety contract this file and its siblings satisfy:
 *
 * - never imported by `src/main.tsx`, `src/App.tsx`, or `src/composition.ts`;
 * - `npm run build`'s `dist/` output does not contain this fixture
 *   (proven by `src/dev-preview/isolation.test.ts`, not just asserted);
 * - constructs only the fixture repositories in `./fixtures.ts`, whose
 *   `login`/`logout`/`extendSession`/`currentSession` methods throw
 *   unconditionally -- there is no path from this file to real
 *   authentication, a real session, Tauri, or SQLite.
 *
 * Wired screens (expanded progressively as each wave added a new screen):
 * Workspace, Attendance, Monthly Summary, Learners, Class Records,
 * Sign-in Activity (UX-02 through UX-04), Sections (Wave 3G/3K/3L --
 * now includes the advisory management panel and SF6 export panel),
 * Teaching Assignments (Wave 2Y), Class Schedule (Wave 2Z),
 * Subject Monitor (Wave 3D), Adviser View (Wave 3F),
 * Teacher Load (Wave 3A/3C).
 */
const fixtureTeachingAssignmentRepository = new FixtureTeachingAssignmentRepository();
const fixtureSubjectAttendanceRepository = new FixtureSubjectAttendanceRepository();
const fixtureSectionRepository = new FixtureSectionRepository();

const attendanceService = new AttendanceApplicationService(new FixtureAttendanceRepository());
const authService = new AuthApplicationService(new FixtureAuthRepository());
const exportService = new ExportApplicationService(new FixtureExportRepository());
const gradingService = new GradingApplicationService(new FixtureGradingRepository());
const learnerService = new LearnerApplicationService(new FixtureLearnerRepository());
const sectionService = new SectionApplicationService(fixtureSectionRepository);
const enrollmentHistoryService = new EnrollmentHistoryApplicationService(
  new FixtureEnrollmentHistoryRepository(),
  fixtureSectionRepository,
);
const subjectService = new SubjectApplicationService(new FixtureSubjectRepository());
const classRecordService = new ClassRecordApplicationService(new FixtureClassRecordRepository());
const assessmentService = new AssessmentApplicationService(new FixtureAssessmentRepository());
const learnerScoreService = new LearnerScoreApplicationService(new FixtureLearnerScoreRepository());
const schoolMemberService = new SchoolMemberApplicationService(new FixtureSchoolMemberRepository());
const sectionAdvisoryService = new SectionAdvisoryApplicationService(
  new FixtureSectionAdvisoryRepository(),
);
const subjectAttendanceService = new SubjectAttendanceApplicationService(
  fixtureSubjectAttendanceRepository,
  fixtureTeachingAssignmentRepository,
);
const teachingAssignmentService = new TeachingAssignmentApplicationService(
  fixtureTeachingAssignmentRepository,
);

export function DevPreviewApp() {
  const [activeTab, setActiveTab] = useState<SignedInTab>("workspace");
  const [attendanceSectionId, setAttendanceSectionId] = useState<string | null>(null);
  const [monthlySummaryContext, setMonthlySummaryContext] = useState<{
    sectionId: string;
    year: number;
    month: number;
  } | null>(null);
  // Contextual handoff from SectionsScreen → TeachingAssignmentsScreen,
  // matching the same narrowly-typed pattern App.tsx uses (not a router
  // param or global store).
  const [assignmentsSectionId, setAssignmentsSectionId] = useState<string | null>(null);
  const [assignmentsSectionName, setAssignmentsSectionName] = useState<string>("");
  // Contextual handoff from TeachingAssignmentsScreen → ScheduleMeetingsScreen.
  const [scheduleMeetingAssignmentId, setScheduleMeetingAssignmentId] = useState<string | null>(
    null,
  );
  const [scheduleMeetingSubjectName, setScheduleMeetingSubjectName] = useState<string>("");

  return (
    <ModeProvider>
      <AppShell session={FIXTURE_SESSION} onLogout={() => {}}>
        <div className="alert alert-info" role="status">
          <p>
            <strong>Development preview — synthetic data, not the production app.</strong> No real
            session, no Tauri, no SQLite. See <code>docs/adr/0032-teacher-workspace-polish.md</code>
            .
          </p>
        </div>
        <WorkbenchNav activeTab={activeTab} onTabChange={setActiveTab} />
        {activeTab === "workspace" ? (
          <TeacherWorkspaceScreen
            displayName={FIXTURE_SESSION.displayName}
            attendanceService={attendanceService}
            authService={authService}
            gradingService={gradingService}
            learnerService={learnerService}
            sectionService={sectionService}
            onOpenAttendance={(sectionId) => {
              setAttendanceSectionId(sectionId);
              setActiveTab("attendance");
            }}
            onManageSections={() => setActiveTab("sections")}
            onViewAuditLog={() => setActiveTab("audit-log")}
          />
        ) : activeTab === "attendance" ? (
          <AttendanceScreen
            attendanceService={attendanceService}
            sectionService={sectionService}
            initialSectionId={attendanceSectionId ?? undefined}
            onViewMonthlySummary={(sectionId, year, month) => {
              setMonthlySummaryContext({ sectionId, year, month });
              setActiveTab("monthly-summary");
            }}
          />
        ) : activeTab === "monthly-summary" ? (
          <MonthlySummaryScreen
            attendanceService={attendanceService}
            sectionService={sectionService}
            exportService={exportService}
            schoolName={FIXTURE_SESSION.schoolName}
            initialSectionId={monthlySummaryContext?.sectionId}
            initialYearMonth={
              monthlySummaryContext
                ? { year: monthlySummaryContext.year, month: monthlySummaryContext.month }
                : undefined
            }
          />
        ) : activeTab === "learners" ? (
          <LearnerListScreen
            learnerService={learnerService}
            exportService={exportService}
            enrollmentHistoryService={enrollmentHistoryService}
          />
        ) : activeTab === "sections" ? (
          <SectionsScreen
            sectionService={sectionService}
            learnerService={learnerService}
            sectionAdvisoryService={sectionAdvisoryService}
            schoolMemberService={schoolMemberService}
            exportService={exportService}
            onOpenRoster={() => {
              /* roster screen not wired in dev-preview (out of scope) */
            }}
            onManageAssignments={(sectionId, sectionName) => {
              setAssignmentsSectionId(sectionId);
              setAssignmentsSectionName(sectionName);
              setActiveTab("teaching-assignments");
            }}
          />
        ) : activeTab === "teaching-assignments" ? (
          <TeachingAssignmentsScreen
            teachingAssignmentService={teachingAssignmentService}
            subjectService={subjectService}
            schoolMemberService={schoolMemberService}
            sectionId={assignmentsSectionId ?? "sec-not-started"}
            sectionName={assignmentsSectionName || "Mabini"}
            onBack={() => setActiveTab("sections")}
            onManageSchedule={(teachingAssignmentId, subjectName) => {
              setScheduleMeetingAssignmentId(teachingAssignmentId);
              setScheduleMeetingSubjectName(subjectName);
              setActiveTab("schedule-meetings");
            }}
          />
        ) : activeTab === "schedule-meetings" ? (
          <ScheduleMeetingsScreen
            teachingAssignmentService={teachingAssignmentService}
            teachingAssignmentId={scheduleMeetingAssignmentId ?? "ta-math-mabini"}
            subjectName={scheduleMeetingSubjectName || "Mathematics"}
            sectionName={assignmentsSectionName || "Mabini"}
            onBack={() => setActiveTab("teaching-assignments")}
          />
        ) : activeTab === "subject-monitor" ? (
          <SubjectMonitorScreen
            subjectAttendanceService={subjectAttendanceService}
            teacherUserId={FIXTURE_SESSION.userId}
          />
        ) : activeTab === "adviser-view" ? (
          <AdviserViewScreen
            subjectAttendanceService={subjectAttendanceService}
            sectionService={sectionService}
          />
        ) : activeTab === "teacher-load" ? (
          <TeacherLoadScreen
            teachingAssignmentService={teachingAssignmentService}
            subjectAttendanceService={subjectAttendanceService}
            schoolMemberService={schoolMemberService}
            teacherUserId={FIXTURE_SESSION.userId}
          />
        ) : activeTab === "class-records" ? (
          <ClassRecordsScreen
            classRecordService={classRecordService}
            sectionService={sectionService}
            subjectService={subjectService}
            gradingService={gradingService}
            assessmentService={assessmentService}
            learnerScoreService={learnerScoreService}
            exportService={exportService}
          />
        ) : activeTab === "audit-log" ? (
          <AuditLogScreen authService={authService} />
        ) : (
          <div className="alert alert-info" role="status">
            <p>This destination isn&apos;t wired in the dev preview.</p>
          </div>
        )}
      </AppShell>
    </ModeProvider>
  );
}
