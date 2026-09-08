import { useContext } from "react";
import { ColorThemeContext, type ColorThemeContextValue } from "./color-theme-context-value";

export function useColorTheme(): ColorThemeContextValue {
  const context = useContext(ColorThemeContext);
  if (!context) {
    throw new Error("useColorTheme must be used within a ColorThemeProvider");
  }
  return context;
}
