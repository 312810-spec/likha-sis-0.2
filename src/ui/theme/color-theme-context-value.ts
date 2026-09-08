import { createContext } from "react";
import type { ColorTheme } from "./color-theme";

export interface ColorThemeContextValue {
  theme: ColorTheme;
  setTheme: (theme: ColorTheme) => void;
}

export const ColorThemeContext = createContext<ColorThemeContextValue | null>(null);
