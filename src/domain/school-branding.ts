/**
 * A school's fully-derived, ready-to-apply theme. Every field is an
 * already-computed hex color — derived once in Rust when a logo is
 * uploaded (`branding::theme::derive_theme`), never recomputed here.
 * System semantic colors (success/warning/error/danger) are never part
 * of this type — they stay the fixed defaults in
 * `src/ui/theme/styles.css` regardless of branding.
 */
export interface SchoolBranding {
  schoolId: string;
  primaryColor: string;
  primaryTextColor: string;
  secondaryColor: string;
  secondaryTextColor: string;
  accentColor: string;
  accentTextColor: string;
  selectedSurfaceColor: string;
  restrainedSurfaceColor: string;
  updatedAt: string;
}

/** A school's uploaded logo, for rendering an `<img>` preview. */
export interface SchoolLogo {
  bytes: Uint8Array;
  mimeType: string;
}
