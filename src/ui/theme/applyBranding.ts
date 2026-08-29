import type { SchoolBranding } from "../../domain/school-branding";

/**
 * Applies (or removes) a school's branding as inline CSS custom property
 * overrides on `target` (the document root in real use, an injectable
 * element in tests). Never edits `styles.css` — the defaults there
 * (`src/ui/theme/styles.css`) stay the fallback for an unbranded school
 * or while branding hasn't loaded yet. Passing `null` reverts to those
 * defaults. System semantic colors are never touched here, matching
 * `theme::derive_theme`'s own contract on the Rust side.
 */
export function applyBranding(branding: SchoolBranding | null, target: HTMLElement): void {
  const tokens: Record<string, string | null> = {
    "--color-secondary": branding?.secondaryColor ?? null,
    "--color-secondary-text": branding?.secondaryTextColor ?? null,
    "--color-accent": branding?.accentColor ?? null,
    "--color-accent-text": branding?.accentTextColor ?? null,
    "--color-selected-surface": branding?.selectedSurfaceColor ?? null,
    "--color-restrained-surface": branding?.restrainedSurfaceColor ?? null,
    // --color-primary/--color-primary-text are the one existing token
    // pair branding actually replaces (a school's primary color becomes
    // the app's real primary color) -- every other token above is new,
    // additive-only.
    "--color-primary": branding?.primaryColor ?? null,
    "--color-primary-text": branding?.primaryTextColor ?? null,
  };

  for (const [property, value] of Object.entries(tokens)) {
    if (value === null) {
      target.style.removeProperty(property);
    } else {
      target.style.setProperty(property, value);
    }
  }
}
