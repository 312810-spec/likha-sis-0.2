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
import { SectionsScreen } from "./ui/SectionsScreen";
import { TeacherWorkspaceScreen } from "./ui/TeacherWorkspaceScreen";
import { ModeProvider } from "./ui/theme/ModeContext";
import "./ui/theme/styles.css";

type SignedInTab =
  | "workspace"
  | "learners"
  | "sections"
  | "attendance"
  | "monthly-summary"
  | "grading-periods"
  | "class-records"
  | "audit-log";
const SIGNED_IN_TABS: readonly { id: SignedInTab; label: string }[] = [
  { id: "workspace", label: "Workspace" },
  { id: "learners", label: "Learners" },
  { id: "sections", label: "Sections" },
  { id: "attendance", label: "Attendance" },
  { id: "monthly-summary", label: "Monthly Summary" },
  { id: "grading-periods", label: "Grading Periods" },
  { id: "class-records", label: "Class Records" },
  { id: "audit-log", label: "Sign-in Activity" },
];

function App() {
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [activeTab, setActiveTab] = useState<SignedInTab>("workspace");
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState<string | null>(null);

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
            <nav role="group" aria-label="Section" className="section-switcher">
              {SIGNED_IN_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
            {activeTab === "workspace" ? (
              <TeacherWorkspaceScreen
                displayName={session.displayName}
                attendanceService={attendanceService}
                authService={authService}
                gradingService={gradingService}
                learnerService={learnerService}
                sectionService={sectionService}
              />
            ) : activeTab === "learners" ? (
              <LearnerListScreen learnerService={learnerService} exportService={exportService} />
            ) : activeTab === "sections" ? (
              <SectionsScreen sectionService={sectionService} learnerService={learnerService} />
            ) : activeTab === "attendance" ? (
              <AttendanceScreen
                attendanceService={attendanceService}
                sectionService={sectionService}
              />
            ) : activeTab === "monthly-summary" ? (
              <MonthlySummaryScreen
                attendanceService={attendanceService}
                sectionService={sectionService}
                exportService={exportService}
                schoolName={session.schoolName}
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
