import { useEffect, useState, type ReactNode } from "react";
import { AppearanceContext, type Appearance } from "./appearance-context-value";
const KEY = "likha-sis:appearance";
function readAppearance(): Appearance {
  try {
    const value = localStorage.getItem(KEY);
    if (value === "light" || value === "dark") return value;
  } catch {
    /* Device storage is optional. */
  }
  return "system";
}
/** Per-device display preference; never part of school records or sync. */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearanceState] = useState<Appearance>(readAppearance);
  useEffect(() => {
    const media =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;
    const apply = () => {
      document.documentElement.dataset.appearance =
        appearance === "system" ? (media?.matches ? "dark" : "light") : appearance;
    };
    apply();
    media?.addEventListener("change", apply);
    return () => media?.removeEventListener("change", apply);
  }, [appearance]);
  function setAppearance(value: Appearance) {
    setAppearanceState(value);
    try {
      localStorage.setItem(KEY, value);
    } catch {
      /* Keep the session preference. */
    }
  }
  return (
    <AppearanceContext.Provider value={{ appearance, setAppearance }}>
      {children}
    </AppearanceContext.Provider>
  );
}
