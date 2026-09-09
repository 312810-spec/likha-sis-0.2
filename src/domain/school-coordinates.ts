/**
 * A school's latitude/longitude, used only by the Weather & Hazard
 * Suspension Alerts advisory (`weather-hazard.ts`,
 * `docs/adr/0079-weather-composition-wiring.md`). `null` means "not
 * configured yet" — the advisory affordance is simply absent in that
 * case, never an error state.
 */
export interface SchoolCoordinates {
  latitude: number;
  longitude: number;
}

/** Mirrors `commands::school::validate_coordinates` on the Rust side —
 * a UX convenience so the settings field can reject an out-of-range
 * value before ever invoking the backend; the backend enforces the real
 * range regardless. */
export function isValidCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}
