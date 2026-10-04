import { createContext } from "react";
export type Appearance = "system" | "light" | "dark";
export const AppearanceContext = createContext<{
  appearance: Appearance;
  setAppearance: (appearance: Appearance) => void;
} | null>(null);
