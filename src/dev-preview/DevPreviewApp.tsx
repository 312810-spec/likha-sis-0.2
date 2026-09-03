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
import { AttendanceScreen } from "../ui/AttendanceScreen";
import { AuditLogScreen } from "../ui/AuditLogScreen";
import { ClassRecordsScreen } from "../ui/ClassRecordsScreen";
import { MonthlySummaryScreen } from "../ui/MonthlySummaryScreen";
import { LearnerListScreen } from "../ui/LearnerListScreen";
import { SectionAdviserScreen } from "../ui/SectionAdviserScreen";
import { SectionsScreen } from "../ui/SectionsScreen";
import { TeacherWorkspaceScreen } from "../ui/TeacherWorkspaceScreen";
import type { SignedInTab } from "../ui/components/workbench-nav-data";
import { AppLayout } from "../ui/shell/AppLayout";
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
  FixtureSubjectRepository,
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
 * Renders the exact same `AppShell`, `WorkbenchNav`, and screen
 * components production uses (reused, not duplicated). Wired
 * destinations have grown with each milestone that needed real
 * browser-rendered verification (see each screen's own git history for
 * which wave added it) -- still a narrow verification tool, not a full
 * second app shell: several `SignedInTab` destinations (e.g. Subject
 * Attendance, Teacher Load, Adviser View) remain unwired and fall
 * through to the catch-all message below, tracked as retained debt in
 * `docs/VERIFICATION-DEBT.md` rather than assumed covered.
 */
const attendanceService = new AttendanceApplicationService(new FixtureAttendanceRepository());
const authService = new AuthApplicationService(new FixtureAuthRepository());
const exportService = new ExportApplicationService(new FixtureExportRepository());
const gradingService = new GradingApplicationService(new FixtureGradingRepository());
const learnerService = new LearnerApplicationService(new FixtureLearnerRepository());
const sectionRepository = new FixtureSectionRepository();
const sectionService = new SectionApplicationService(sectionRepository);
const enrollmentHistoryService = new EnrollmentHistoryApplicationService(
  new FixtureEnrollmentHistoryRepository(),
  sectionRepository,
);
const subjectService = new SubjectApplicationService(new FixtureSubjectRepository());
const classRecordService = new ClassRecordApplicationService(new FixtureClassRecordRepository());
const assessmentService = new AssessmentApplicationService(new FixtureAssessmentRepository());
const learnerScoreService = new LearnerScoreApplicationService(new FixtureLearnerScoreRepository());
const schoolMemberService = new SchoolMemberApplicationService(new FixtureSchoolMemberRepository());
const sectionAdvisoryService = new SectionAdvisoryApplicationService(
  new FixtureSectionAdvisoryRepository(),
);

export function DevPreviewApp() {
  const [activeTab, setActiveTab] = useState<SignedInTab>("workspace");
  const [attendanceSectionId, setAttendanceSectionId] = useState<string | null>(null);
  const [monthlySummaryContext, setMonthlySummaryContext] = useState<{
    sectionId: string;
    year: number;
    month: number;
  } | null>(null);
  const [sectionAdviserSection, setSectionAdviserSection] = useState<{
    sectionId: string;
    sectionName: string;
  } | null>(null);

  return (
    <ModeProvider>
      <AppLayout
        session={FIXTURE_SESSION}
        activeTab={activeTab}
        onNavigate={setActiveTab}
        onLogout={() => {}}
      >
        <div className="alert alert-info" role="status">
          <p>
            <strong>Development preview — synthetic data, not the production app.</strong> No real
            session, no Tauri, no SQLite. See <code>docs/adr/0032-teacher-workspace-polish.md</code>
            .
          </p>
        </div>
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
        ) : activeTab === "sections" ? (
          <SectionsScreen
            sectionService={sectionService}
            learnerService={learnerService}
            onOpenRoster={() => {}}
            onManageAssignments={() => {}}
            onManageAdviser={(sectionId, sectionName) => {
              setSectionAdviserSection({ sectionId, sectionName });
              setActiveTab("section-adviser");
            }}
          />
        ) : activeTab === "section-adviser" ? (
          <SectionAdviserScreen
            sectionAdvisoryService={sectionAdvisoryService}
            schoolMemberService={schoolMemberService}
            sectionId={sectionAdviserSection?.sectionId ?? "sec-not-started"}
            sectionName={sectionAdviserSection?.sectionName ?? "Mabini"}
            onBack={() => setActiveTab("sections")}
          />
        ) : (
          <div className="alert alert-info" role="status">
            <p>This destination isn't wired in the dev preview (out of scope for UX-02).</p>
          </div>
        )}
      </AppLayout>
    </ModeProvider>
  );
}
