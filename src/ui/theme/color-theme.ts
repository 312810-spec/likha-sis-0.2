/** Batch 4: the 3-way Light/System/Dark theme toggle. Independent of
 * `TeacherMode` (Efficient/Comfortable/Guided, `modes.ts`) -- one picks
 * information density, this picks light/dark rendering. "System" (the
 * default) means "no explicit override": the existing
 * `prefers-color-scheme` media query in `styles.css` decides, unchanged
 * from before this batch. */
export type ColorTheme = "light" | "system" | "dark";

export const COLOR_THEMES: readonly ColorTheme[] = ["light", "system", "dark"];

export const DEFAULT_COLOR_THEME: ColorTheme = "system";

export const COLOR_THEME_LABELS: Record<ColorTheme, string> = {
  light: "Light",
  system: "System",
  dark: "Dark",
};

export function isColorTheme(value: string): value is ColorTheme {
  return (COLOR_THEMES as readonly string[]).includes(value);
}
