import { useEffect, useRef, useState } from "react";
import { recoverResumePointer, type ResumePointerAuthority, type ResumeRecovery } from "./resume-pointer-recovery";
import type { ResumePointerStorage } from "./resume-pointer";

export function ResumeWorkScreen({ userId, authority, storage, onResume }: {
  userId: string;
  authority: ResumePointerAuthority;
  storage?: ResumePointerStorage;
  onResume: (destination: ResumeRecovery) => void;
}) {
  const currentUser = useRef(userId);
  currentUser.current = userId;
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setAvailable(false);
    void recoverResumePointer(userId, authority, storage).then((result) => {
      if (active) setAvailable(result !== null);
    });
    return () => { active = false; };
  }, [userId, authority, storage]);
  if (!available) return null;
  return <button type="button" disabled={busy} onClick={() => {
    setBusy(true);
    // Always recheck at click time; an assignment may have changed since display.
    void recoverResumePointer(userId, authority, storage).then((result) => {
      if (currentUser.current !== userId) return;
      if (result) onResume(result);
      else setAvailable(false);
    }).finally(() => setBusy(false));
  }}>{busy ? "Checking your assignment…" : "Continue your last class or advisory"}</button>;
}
