import { useEffect, useState } from "react";
import {
  assessmentService,
  attendanceService,
  authService,
  classRecordService,
  enrollmentHistoryService,
  exportService,
  formGenerationService,
  gradingService,
  learnerScoreService,
  learnerService,
  onSessionExpired,
  schoolMemberService,
  schoolService,
  sectionService,
  setupService,
  sf1ImportService,
  subjectAttendanceService,
  subjectService,
  teachingAssignmentService,
} from "./composition";
import type { CurrentSession } from "./domain/session";
import { AppShell } from "./ui/AppShell";
import { AttendanceScreen } from "./ui/AttendanceScreen";
import { AuditLogScreen } from "./ui/AuditLogScreen";
import { ClassRecordsScreen } from "./ui/ClassRecordsScreen";
import { FirstRunSetupScreen } from "./ui/FirstRunSetupScreen";
import { LearnerListScreen } from "./ui/LearnerListScreen";
import { LoginScreen } from "./ui/LoginScreen";
import { GradingPeriodsScreen } from "./ui/GradingPeriodsScreen";
import { IdleTimeoutWarning } from "./ui/IdleTimeoutWarning";
import { MonthlySummaryScreen } from "./ui/MonthlySummaryScreen";
import { ScheduleMeetingsScreen } from "./ui/ScheduleMeetingsScreen";
import { SectionRosterScreen } from "./ui/SectionRosterScreen";
import { SectionsScreen } from "./ui/SectionsScreen";
import { Sf1ImportScreen } from "./ui/Sf1ImportScreen";
import { SubjectAttendanceScreen } from "./ui/SubjectAttendanceScreen";
import { TeacherLoadScreen } from "./ui/TeacherLoadScreen";
import { TeacherWorkspaceScreen } from "./ui/TeacherWorkspaceScreen";
import { TeachingAssignmentsScreen } from "./ui/TeachingAssignmentsScreen";
import { TodaysClassesScreen } from "./ui/TodaysClassesScreen";
import { WorkbenchNav } from "./ui/components/WorkbenchNav";
import { TAB_LABELS, type SignedInTab } from "./ui/components/workbench-nav-data";
import { ModeProvider } from "./ui/theme/ModeContext";
import "./ui/theme/styles.css";

function App() {
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [activeTab, setActiveTab] = useState<SignedInTab>("workspace");
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState<string | null>(null);
  // Set only by TeacherWorkspaceScreen's "mark/continue/review attendance"
  // action, so AttendanceScreen can open with that section already
  // selected -- a narrowly-typed prop, not a router/URL param/global
  // store. See docs/adr/0032-teacher-workspace-polish.md.
  const [attendanceSectionId, setAttendanceSectionId] = useState<string | null>(null);
  // Set only by SectionsScreen's "Open roster" action, so
  // SectionRosterScreen opens for that section -- same narrowly-typed
  // handoff as attendanceSectionId above, not a router/global store.
  const [rosterSectionId, setRosterSectionId] = useState<string | null>(null);
  // Set only by AttendanceScreen's "View monthly summary" action, so
  // MonthlySummaryScreen can open with the same section and year/month
  // already selected -- same narrowly-typed handoff pattern as above, not
  // a router/global store. See
  // docs/adr/0033-daily-attendance-and-monthly-summary-polish.md.
  const [monthlySummaryContext, setMonthlySummaryContext] = useState<{
    sectionId: string;
    year: number;
    month: number;
  } | null>(null);
  // Set only by TodaysClassesScreen's "Check attendance" action, so
  // SubjectAttendanceScreen opens with that class already selected --
  // same narrowly-typed handoff pattern as above, not a router/global
  // store.
  const [subjectAttendanceAssignmentId, setSubjectAttendanceAssignmentId] = useState<string | null>(
    null,
  );
  // Set only by SectionsScreen's "Manage assignments" action, so
  // TeachingAssignmentsScreen opens for that section -- same
  // narrowly-typed handoff pattern as rosterSectionId above, not a
  // router/global store. sectionName travels alongside it since
  // SectionsScreen already has the full Section in hand.
  const [teachingAssignmentsSection, setTeachingAssignmentsSection] = useState<{
    sectionId: string;
    sectionName: string;
  } | null>(null);
  // Set only by TeachingAssignmentsScreen's "Manage schedule" action, so
  // ScheduleMeetingsScreen opens for that assignment -- same
  // narrowly-typed handoff pattern as above, not a router/global store.
  const [scheduleMeetingsAssignment, setScheduleMeetingsAssignment] = useState<{
    teachingAssignmentId: string;
    subjectName: string;
  } | null>(null);

  function handleSessionExpired() {
    setSession(null);
    setSessionExpiredNotice("Your session has expired. Please sign in again.");
  }

  useEffect(() => {
    // Fires from any command, on any screen, that fails because the
    // session is no longer valid (idle timeout, absolute TTL, or
    // revocation) — see ADR-0022. Without this, each screen was left to
    // fail its own in-flight request with a generic, unexplained error;
    // this returns the teacher to sign-in with a clear reason instead.
    return onSessionExpired(handleSessionExpired);
  }, []);

  useEffect(() => {
    // Gives a teacher an obvious sense of current location beyond the
    // active nav item's own highlight -- visible in the browser tab
    // and read aloud by some screen readers on navigation.
    document.title = session ? `${TAB_LABELS[activeTab]} · LIKHA-SIS` : "LIKHA-SIS";
  }, [session, activeTab]);

  useEffect(() => {
    let cancelled = false;
    // The setup screen is only ever shown because the backend says so
    // (installationStatus), never from a client-side-only guess — see
    // ADR-0006.
    Promise.all([setupService.installationStatus(), authService.currentSession()])
      .then(([status, currentSession]) => {
        if (cancelled) return;
        setNeedsSetup(status.needsSetup);
        setSession(currentSession);
      })
      .finally(() => {
        if (!cancelled) setCheckingStatus(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    await authService.logout();
    setSessionExpiredNotice(null);
    setSession(null);
  }

  function handleSetupComplete(newSession: CurrentSession) {
    setNeedsSetup(false);
    setSession(newSession);
  }

  function handleLoggedIn(newSession: CurrentSession) {
    setSessionExpiredNotice(null);
    setSession(newSession);
  }

  return (
    <ModeProvider>
      <AppShell session={session} onLogout={handleLogout}>
        {checkingStatus ? (
          <p role="status">Loading…</p>
        ) : needsSetup ? (
          <FirstRunSetupScreen setupService={setupService} onSetupComplete={handleSetupComplete} />
        ) : session ? (
          <>
            <IdleTimeoutWarning authService={authService} onExpired={handleSessionExpired} />
            <WorkbenchNav
              activeTab={activeTab === "section-roster" ? "sections" : activeTab}
              onTabChange={setActiveTab}
            />
            {activeTab === "workspace" ? (
              <TeacherWorkspaceScreen
                displayName={session.displayName}
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
                onOpenRoster={(sectionId) => {
                  setRosterSectionId(sectionId);
                  setActiveTab("section-roster");
                }}
                onManageAssignments={(sectionId, sectionName) => {
                  setTeachingAssignmentsSection({ sectionId, sectionName });
                  setActiveTab("teaching-assignments");
                }}
              />
            ) : activeTab === "section-roster" ? (
              rosterSectionId ? (
                <SectionRosterScreen
                  sectionService={sectionService}
                  formGenerationService={formGenerationService}
                  sectionId={rosterSectionId}
                  onBack={() => setActiveTab("sections")}
                />
              ) : (
                // Reached only if the roster tab is active with no section
                // context (e.g. a stale state after a reload) -- fall back
                // to Sections rather than render a blank or wrong screen.
                <SectionsScreen
                  sectionService={sectionService}
                  learnerService={learnerService}
                  onOpenRoster={(sectionId) => {
                    setRosterSectionId(sectionId);
                    setActiveTab("section-roster");
                  }}
                  onManageAssignments={(sectionId, sectionName) => {
                    setTeachingAssignmentsSection({ sectionId, sectionName });
                    setActiveTab("teaching-assignments");
                  }}
                />
              )
            ) : activeTab === "teaching-assignments" ? (
              teachingAssignmentsSection ? (
                <TeachingAssignmentsScreen
                  teachingAssignmentService={teachingAssignmentService}
                  subjectService={subjectService}
                  schoolMemberService={schoolMemberService}
                  sectionId={teachingAssignmentsSection.sectionId}
                  sectionName={teachingAssignmentsSection.sectionName}
                  onBack={() => setActiveTab("sections")}
                  onManageSchedule={(teachingAssignmentId, subjectName) => {
                    setScheduleMeetingsAssignment({ teachingAssignmentId, subjectName });
                    setActiveTab("schedule-meetings");
                  }}
                />
              ) : (
                // Reached only if this tab is active with no section
                // context (e.g. a stale state after a reload) -- fall back
                // to Sections rather than render a blank or wrong screen.
                <SectionsScreen
                  sectionService={sectionService}
                  learnerService={learnerService}
                  onOpenRoster={(sectionId) => {
                    setRosterSectionId(sectionId);
                    setActiveTab("section-roster");
                  }}
                  onManageAssignments={(sectionId, sectionName) => {
                    setTeachingAssignmentsSection({ sectionId, sectionName });
                    setActiveTab("teaching-assignments");
                  }}
                />
              )
            ) : activeTab === "schedule-meetings" ? (
              scheduleMeetingsAssignment && teachingAssignmentsSection ? (
                <ScheduleMeetingsScreen
                  teachingAssignmentService={teachingAssignmentService}
                  teachingAssignmentId={scheduleMeetingsAssignment.teachingAssignmentId}
                  subjectName={scheduleMeetingsAssignment.subjectName}
                  sectionName={teachingAssignmentsSection.sectionName}
                  onBack={() => setActiveTab("teaching-assignments")}
                />
              ) : (
                // Reached only if this tab is active with no assignment
                // context (e.g. a stale state after a reload) -- fall back
                // to Sections rather than render a blank or wrong screen.
                <SectionsScreen
                  sectionService={sectionService}
                  learnerService={learnerService}
                  onOpenRoster={(sectionId) => {
                    setRosterSectionId(sectionId);
                    setActiveTab("section-roster");
                  }}
                  onManageAssignments={(sectionId, sectionName) => {
                    setTeachingAssignmentsSection({ sectionId, sectionName });
                    setActiveTab("teaching-assignments");
                  }}
                />
              )
            ) : activeTab === "sf1-import" ? (
              <Sf1ImportScreen
                sf1ImportService={sf1ImportService}
                sectionService={sectionService}
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
            ) : activeTab === "today-classes" ? (
              <TodaysClassesScreen
                subjectAttendanceService={subjectAttendanceService}
                teacherUserId={session.userId}
                onCheckAttendance={(teachingAssignmentId) => {
                  setSubjectAttendanceAssignmentId(teachingAssignmentId);
                  setActiveTab("subject-attendance");
                }}
              />
            ) : activeTab === "subject-attendance" ? (
              <SubjectAttendanceScreen
                subjectAttendanceService={subjectAttendanceService}
                teacherUserId={session.userId}
                initialAssignmentId={subjectAttendanceAssignmentId ?? undefined}
              />
            ) : activeTab === "teacher-load" ? (
              <TeacherLoadScreen
                teachingAssignmentService={teachingAssignmentService}
                subjectAttendanceService={subjectAttendanceService}
                teacherUserId={session.userId}
              />
            ) : activeTab === "monthly-summary" ? (
              <MonthlySummaryScreen
                attendanceService={attendanceService}
                sectionService={sectionService}
                exportService={exportService}
                schoolName={session.schoolName}
                initialSectionId={monthlySummaryContext?.sectionId}
                initialYearMonth={
                  monthlySummaryContext
                    ? { year: monthlySummaryContext.year, month: monthlySummaryContext.month }
                    : undefined
                }
              />
            ) : activeTab === "grading-periods" ? (
              <GradingPeriodsScreen gradingService={gradingService} />
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
            ) : null}
          </>
        ) : (
          <LoginScreen
            authService={authService}
            schoolService={schoolService}
            onLoggedIn={handleLoggedIn}
            notice={sessionExpiredNotice}
          />
        )}
      </AppShell>
    </ModeProvider>
  );
}

export default App;
