import { useEffect, useState } from "react";
import {
  assessmentService,
  attendanceService,
  authService,
  classRecordService,
  exportService,
  gradingService,
  learnerScoreService,
  learnerService,
  onSessionExpired,
  schoolBrandingService,
  schoolService,
  sectionService,
  setupService,
  subjectService,
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
import { SchoolBrandingScreen } from "./ui/SchoolBrandingScreen";
import { SectionsScreen } from "./ui/SectionsScreen";
import { TeacherWorkspaceScreen } from "./ui/TeacherWorkspaceScreen";
import { WorkbenchNav } from "./ui/components/WorkbenchNav";
import { TAB_LABELS, type SignedInTab } from "./ui/components/workbench-nav-data";
import { applyBranding } from "./ui/theme/applyBranding";
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
    // LIKHA runs on shared school computers with independent per-teacher
    // sessions (ADR-0004) -- a school's branding is applied as inline
    // style overrides (src/ui/theme/applyBranding.ts) that otherwise
    // persist across logins. Without this, School A's colors would keep
    // showing after logout, including to a School B teacher signing in
    // next on the same machine. Reset to the default theme immediately
    // on every session change, then fetch and apply the *new* session's
    // own branding (or nothing, reverting to defaults, if it has none)
    // -- never assume the previous session's applied theme is still
    // correct. SchoolBrandingScreen applies live updates after an
    // upload/reset itself; this covers every other screen and the
    // moment of sign-in itself.
    if (!session) {
      applyBranding(null, document.documentElement);
      return;
    }
    let cancelled = false;
    schoolBrandingService
      .getCurrent()
      .then((branding) => {
        if (!cancelled) applyBranding(branding, document.documentElement);
      })
      .catch(() => {
        // Non-fatal: the app still works with the default theme if
        // branding fails to load.
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

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
            <WorkbenchNav activeTab={activeTab} onTabChange={setActiveTab} />
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
              <LearnerListScreen learnerService={learnerService} exportService={exportService} />
            ) : activeTab === "sections" ? (
              <SectionsScreen sectionService={sectionService} learnerService={learnerService} />
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
            ) : activeTab === "school-branding" ? (
              <SchoolBrandingScreen schoolBrandingService={schoolBrandingService} />
            ) : (
              <AuditLogScreen authService={authService} />
            )}
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
