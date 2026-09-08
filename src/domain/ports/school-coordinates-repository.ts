import type { SchoolCoordinates } from "../school-coordinates";

/**
 * Repository port for the caller's own school's coordinates.
 * `school_id` is never a parameter anywhere here — the backend always
 * derives it from the authenticated session, matching every other
 * same-school command in this codebase (see `SchoolLogoRepository`).
 */
export interface SchoolCoordinatesRepository {
  /** Any authenticated member of the school may read it back — it
   * feeds the weather advisory shown to any teacher. `null` means "not
   * configured yet," never an error. */
  get(): Promise<SchoolCoordinates | null>;
  /**
   * Sets (or replaces) the school's coordinates. A thrown error means
   * either the caller lacks the `ManageSchoolCoordinates` capability
   * (School Head only) or the value failed the backend's own range
   * validation.
   */
  set(latitude: number, longitude: number): Promise<void>;
  /** Clears the coordinates, reverting to "no weather advisory
   * configured." Same `ManageSchoolCoordinates` gate as `set`. */
  clear(): Promise<void>;
}
