import { useEffect, useState, type ReactNode } from "react";
import { AppearanceContext } from "./appearance-context-value";
import {
  applyAppearance,
  readStoredAppearance,
  storeAppearance,
  type Appearance,
} from "./appearance";

/**
 * Holds the device-local Light/System/Dark preference (ADR-0070) and
 * keeps `<html data-appearance>` and `localStorage` in sync with it.
 *
 * `main.tsx` already applied the stored value to `<html>` before first
 * paint, so the mount effect here is idempotent — it re-asserts the
 * attribute so a later `setAppearance` call has an effect, and covers
 * the (test-only) case where the provider mounts without the pre-paint
 * step having run.
 */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearanceState] = useState<Appearance>(readStoredAppearance);

  useEffect(() => {
    applyAppearance(document.documentElement, appearance);
  }, [appearance]);

  function setAppearance(next: Appearance) {
    setAppearanceState(next);
    storeAppearance(next);
  }

  return (
    <AppearanceContext.Provider value={{ appearance, setAppearance }}>
      {children}
    </AppearanceContext.Provider>
  );
}
