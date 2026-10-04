import { useEffect, useRef, useState } from "react";
import {
  recoverResumePointer,
  type ResumePointerAuthority,
  type ResumeRecovery,
} from "./resume-pointer-recovery";
import type { ResumePointerStorage } from "./resume-pointer";

export function ResumeWorkScreen({
  userId,
  authority,
  storage,
  onResume,
}: {
  userId: string;
  authority: ResumePointerAuthority;
  storage?: ResumePointerStorage;
  onResume: (destination: ResumeRecovery) => void;
}) {
  const generation = useRef(0);
  const [status, setStatus] = useState<{
    userId: string;
    authority: ResumePointerAuthority;
    storage?: ResumePointerStorage;
    available: boolean;
    busy: boolean;
  } | null>(null);
  useEffect(() => {
    const current = ++generation.current;
    void recoverResumePointer(userId, authority, storage).then((result) => {
      if (generation.current === current) {
        setStatus({ userId, authority, storage, available: result !== null, busy: false });
      }
    });
    return () => {
      generation.current += 1;
    };
  }, [userId, authority, storage]);
  // A prior principal's availability is never displayed while new scope loads.
  if (
    !status?.available ||
    status.userId !== userId ||
    status.authority !== authority ||
    status.storage !== storage
  )
    return null;
  return (
    <button
      type="button"
      disabled={status.busy}
      onClick={() => {
        const current = generation.current;
        setStatus({ userId, authority, storage, available: true, busy: true });
        // Always recheck at click time; an assignment may have changed since display.
        void recoverResumePointer(userId, authority, storage)
          .then((result) => {
            if (generation.current !== current) return;
            if (result) onResume(result);
            else setStatus({ userId, authority, storage, available: false, busy: false });
          })
          .finally(() => {
            if (generation.current === current) {
              setStatus((previous) => (previous ? { ...previous, busy: false } : previous));
            }
          });
      }}
    >
      {status.busy ? "Checking your assignment…" : "Continue your last class or advisory"}
    </button>
  );
}
