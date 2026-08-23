import { useEffect, useState, type ReactNode } from "react";
import { ModeContext } from "./mode-context-value";
import { DEFAULT_TEACHER_MODE, isTeacherMode, type TeacherMode } from "./modes";

const STORAGE_KEY = "likha-sis:teacher-mode";

function readStoredMode(): TeacherMode {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && isTeacherMode(stored)) {
      return stored;
    }
  } catch {
    // localStorage can throw (private browsing, disabled storage, etc.) —
    // fall back to the default rather than let this break the app.
  }
  return DEFAULT_TEACHER_MODE;
}

/**
 * Preserves the teacher's Efficient/Comfortable/Guided preference across
 * launches. This is a per-device UI convenience, not app data — it is
 * deliberately kept out of the encrypted working database (ADR-0003) and
 * the session/authorization model (ADR-0004), neither of which this has
 * anything to do with.
 */
export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<TeacherMode>(readStoredMode);

  useEffect(() => {
    document.documentElement.dataset.teacherMode = mode;
  }, [mode]);

  function setMode(next: TeacherMode) {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Non-fatal: the mode still applies for this session even if it
      // can't be remembered for next time.
    }
  }

  return <ModeContext.Provider value={{ mode, setMode }}>{children}</ModeContext.Provider>;
}
