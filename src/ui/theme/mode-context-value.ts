import { createContext } from "react";
import type { TeacherMode } from "./modes";

export interface ModeContextValue {
  mode: TeacherMode;
  setMode: (mode: TeacherMode) => void;
}

export const ModeContext = createContext<ModeContextValue | null>(null);
