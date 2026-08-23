import { useContext } from "react";
import { ModeContext, type ModeContextValue } from "./mode-context-value";

export function useTeacherMode(): ModeContextValue {
  const context = useContext(ModeContext);
  if (!context) {
    throw new Error("useTeacherMode must be used within a ModeProvider");
  }
  return context;
}
