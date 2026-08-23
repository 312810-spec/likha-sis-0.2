import { useEffect, useState } from "react";
import { authService, learnerService, schoolService, setupService } from "./composition";
import type { CurrentSession } from "./domain/session";
import { AppShell } from "./ui/AppShell";
import { FirstRunSetupScreen } from "./ui/FirstRunSetupScreen";
import { LearnerListScreen } from "./ui/LearnerListScreen";
import { LoginScreen } from "./ui/LoginScreen";
import { ModeProvider } from "./ui/theme/ModeContext";
import "./ui/theme/styles.css";

function App() {
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);

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
          <LearnerListScreen learnerService={learnerService} />
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
