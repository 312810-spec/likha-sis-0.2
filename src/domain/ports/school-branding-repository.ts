import type { SchoolBranding, SchoolLogo } from "../school-branding";

/**
 * Repository port for a school's branding. UI and application code depend
 * only on this interface, never on the concrete Tauri adapter that
 * implements it.
 */
export interface SchoolBrandingRepository {
  get(): Promise<SchoolBranding | null>;
  getLogo(): Promise<SchoolLogo | null>;
  set(logoBytes: Uint8Array, mimeType: string): Promise<SchoolBranding>;
  clear(): Promise<void>;
}
