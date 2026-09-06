import type { SchoolLogo } from "../school-logo";

/**
 * Repository port for the caller's own school's branding logo.
 * `school_id` is never a parameter anywhere here — the backend always
 * derives it from the authenticated session, matching every other
 * same-school command in this codebase.
 */
export interface SchoolLogoRepository {
  /** Any authenticated member of the school may read it back — it
   * renders in the shared app shell for every role. */
  get(): Promise<SchoolLogo | null>;
  /**
   * Uploads or replaces the logo. A thrown error means either the
   * caller lacks the `ManageSchoolBranding` capability (School Head
   * only) or the upload failed the backend's own size/MIME-type
   * validation — the UI should already have screened both client-side
   * for a fast field-level message, but the backend stays
   * authoritative.
   */
  set(mime: string, bytes: Uint8Array): Promise<void>;
  /** Removes the logo, reverting to the default placeholder. Same
   * `ManageSchoolBranding` gate as `set`. */
  clear(): Promise<void>;
}
