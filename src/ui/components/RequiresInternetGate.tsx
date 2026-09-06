import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { ConnectivityChecker } from "../../domain/ports/connectivity-checker";
import { Alert } from "./Alert";
import { Loading } from "./Loading";

interface RequiresInternetGateProps {
  connectivityChecker: ConnectivityChecker;
  children: ReactNode;
}

type ConnectivityState = "checking" | "online" | "offline";

/**
 * Wraps a feature that calls a third-party cloud service directly from the
 * device (e.g. AI-assisted lesson-plan generation using the teacher's own
 * Gemini API key — see `docs/adr/0035-roadmap-reconciliation-and-execution-waves.md`
 * Wave 6). Every other LIKHA feature works fully offline; this is a
 * deliberate, disclosed exception, so it must never look usable while
 * offline — the teacher would fill in a form and then hit a failed
 * network call with everything already typed.
 *
 * Re-checks automatically when the OS reports the network coming back
 * (the `online` browser event), not just on manual retry, so the gate
 * doesn't strand a teacher who plugs the ethernet cable back in.
 */
export function RequiresInternetGate({ connectivityChecker, children }: RequiresInternetGateProps) {
  const [state, setState] = useState<ConnectivityState>("checking");

  const check = useCallback(() => {
    let cancelled = false;
    setState("checking");
    connectivityChecker
      .isOnline()
      .then((online) => {
        if (!cancelled) setState(online ? "online" : "offline");
      })
      .catch(() => {
        if (!cancelled) setState("offline");
      });
    return () => {
      cancelled = true;
    };
  }, [connectivityChecker]);

  useEffect(
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial check must run on mount
    () => check(),
    [check],
  );

  useEffect(() => {
    window.addEventListener("online", check);
    return () => window.removeEventListener("online", check);
  }, [check]);

  if (state === "checking") {
    return <Loading label="Checking your connection…" />;
  }

  if (state === "offline") {
    return (
      <Alert tone="error">
        <p>
          This tool needs an internet connection to generate content, and no internet connection was
          found right now.
        </p>
        <button type="button" onClick={check}>
          Try again
        </button>
      </Alert>
    );
  }

  return (
    <>
      <Alert tone="warning">
        This tool needs an internet connection — it sends what you type here to Google&apos;s Gemini
        AI service using your own API key to generate content.
      </Alert>
      {children}
    </>
  );
}
