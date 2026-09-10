/**
 * Precision Intelligence appearance preference (ADR-0070).
 *
 * A device-local, presentation-only choice between an explicit light
 * theme, an explicit dark theme, and following the operating system
 * ("system", the default). It is deliberately kept out of the encrypted
 * working database (ADR-0003) and the session/authorization model
 * (ADR-0004) — it has nothing to do with either, exactly like the
 * Efficient/Comfortable/Guided density preference in `modes.ts`.
 *
 * How it reaches CSS: `applyAppearance` writes (or clears) the
 * `data-appearance` attribute on `<html>`. "system" clears the
 * attribute so that dark mode continues to work with **zero JavaScript**
 * via the plain `@media (prefers-color-scheme: dark)` rule — an explicit
 * choice only ever *overrides* that. See `styles.css`.
 */

export type Appearance = "light" | "system" | "dark";

export const APPEARANCES: readonly Appearance[] = ["light", "system", "dark"];

const DEFAULT_APPEARANCE: Appearance = "system";

export const APPEARANCE_LABELS: Record<Appearance, string> = {
  light: "Light",
  system: "System",
  dark: "Dark",
};

function isAppearance(value: string): value is Appearance {
  return (APPEARANCES as readonly string[]).includes(value);
}

const STORAGE_KEY = "likha-sis:appearance";

/**
 * The one place the stored preference is read. Imported both by
 * `main.tsx` (to apply it before first paint, avoiding a flash) and by
 * `AppearanceProvider` (its initial state), so there is a single source
 * of truth.
 */
export function readStoredAppearance(): Appearance {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && isAppearance(stored)) {
      return stored;
    }
  } catch {
    // localStorage can throw (private mode, disabled storage) — fall
    // back to the default rather than let this break the app.
  }
  return DEFAULT_APPEARANCE;
}

export function storeAppearance(value: Appearance): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Non-fatal: the choice still applies for this session even if it
    // can't be remembered for next time.
  }
}

/**
 * Reflects `value` onto the given element (always `<html>` in practice).
 * "system" removes the attribute so the media query governs; "light"
 * and "dark" set it so the matching `:root[data-appearance="…"]` block
 * overrides the media query.
 */
export function applyAppearance(el: HTMLElement, value: Appearance): void {
  if (value === "system") {
    el.removeAttribute("data-appearance");
  } else {
    el.setAttribute("data-appearance", value);
  }
}
