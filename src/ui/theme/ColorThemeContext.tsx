import { useEffect, useState, type ReactNode } from "react";
import { ColorThemeContext } from "./color-theme-context-value";
import { DEFAULT_COLOR_THEME, isColorTheme, type ColorTheme } from "./color-theme";

const STORAGE_KEY = "likha-sis:color-theme";

function readStoredTheme(): ColorTheme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && isColorTheme(stored)) return stored;
  } catch {
    // localStorage can throw (private browsing, disabled storage, etc.) --
    // fall back to "system" rather than let this break the app.
  }
  return DEFAULT_COLOR_THEME;
}

/**
 * Same per-device-convenience shape as `ModeProvider` (`ModeContext.tsx`)
 * -- a viewer preference, not app data, kept out of the encrypted
 * working database and the session/authorization model. "system" writes
 * no `data-theme` attribute at all, leaving the existing
 * `prefers-color-scheme` media query (`styles.css`) as the sole source
 * of truth, exactly as before this batch; "light"/"dark" stamp
 * `data-theme` so the explicit-override CSS blocks win.
 */
export function ColorThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ColorTheme>(readStoredTheme);

  useEffect(() => {
    if (theme === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = theme;
    }
  }, [theme]);

  function setTheme(next: ColorTheme) {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Non-fatal: the theme still applies for this session.
    }
  }

  return (
    <ColorThemeContext.Provider value={{ theme, setTheme }}>{children}</ColorThemeContext.Provider>
  );
}
