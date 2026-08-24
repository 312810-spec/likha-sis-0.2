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
  schoolService,
  sectionService,
  setupService,
  subjectService,
} from "./composition";
import type { CurrentSession } from "./domain/session";
import { AppShell } from "./ui/AppShell";
import { AttendanceScreen } from "./ui/AttendanceScreen";
import { ClassRecordsScreen } from "./ui/ClassRecordsScreen";
import { FirstRunSetupScreen } from "./ui/FirstRunSetupScreen";
import { LearnerListScreen } from "./ui/LearnerListScreen";
import { LoginScreen } from "./ui/LoginScreen";
import { GradingPeriodsScreen } from "./ui/GradingPeriodsScreen";
import { MonthlySummaryScreen } from "./ui/MonthlySummaryScreen";
import { SectionsScreen } from "./ui/SectionsScreen";
import { ModeProvider } from "./ui/theme/ModeContext";
import "./ui/theme/styles.css";

type SignedInTab =
  "learners" | "sections" | "attendance" | "monthly-summary" | "grading-periods" | "class-records";
const SIGNED_IN_TABS: readonly { id: SignedInTab; label: string }[] = [
  { id: "learners", label: "Learners" },
  { id: "sections", label: "Sections" },
  { id: "attendance", label: "Attendance" },
  { id: "monthly-summary", label: "Monthly Summary" },
  { id: "grading-periods", label: "Grading Periods" },
  { id: "class-records", label: "Class Records" },
];

function App() {
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [activeTab, setActiveTab] = useState<SignedInTab>("learners");

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
    setSession(null);
  }

  function handleSetupComplete(newSession: CurrentSession) {
    setNeedsSetup(false);
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
            {activeTab === "learners" ? (
              <LearnerListScreen learnerService={learnerService} />
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
            ) : (
              <ClassRecordsScreen
                classRecordService={classRecordService}
                sectionService={sectionService}
                subjectService={subjectService}
                gradingService={gradingService}
                assessmentService={assessmentService}
                learnerScoreService={learnerScoreService}
                exportService={exportService}
              />
            )}
          </>
        ) : (
          <LoginScreen
            authService={authService}
            schoolService={schoolService}
            onLoggedIn={setSession}
          />
        )}
      </AppShell>
    </ModeProvider>
  );
}

export default App;
