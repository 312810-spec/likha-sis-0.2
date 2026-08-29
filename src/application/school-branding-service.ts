import { ValidationError } from "../domain/errors";
import type { SchoolBrandingRepository } from "../domain/ports/school-branding-repository";
import type { SchoolBranding, SchoolLogo } from "../domain/school-branding";

/** Mirrors `branding::logo::MAX_LOGO_BYTES` on the Rust side — checked
 * here too so a teacher gets an immediate, specific message instead of
 * waiting on a round trip only to have the backend reject it. */
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const SUPPORTED_MIME_TYPES = new Set(["image/png", "image/jpeg"]);

/**
 * Orchestrates school-branding use cases. UI code depends on this, never
 * directly on a `SchoolBrandingRepository` — matches every other
 * `*ApplicationService` in this codebase.
 */
export class SchoolBrandingApplicationService {
  constructor(private readonly branding: SchoolBrandingRepository) {}

  getCurrent(): Promise<SchoolBranding | null> {
    return this.branding.get();
  }

  getLogo(): Promise<SchoolLogo | null> {
    return this.branding.getLogo();
  }

  async uploadLogo(logoBytes: Uint8Array, mimeType: string): Promise<SchoolBranding> {
    if (logoBytes.length === 0) {
      throw new ValidationError("Please choose a logo file.");
    }
    if (logoBytes.length > MAX_LOGO_BYTES) {
      throw new ValidationError("Logo file is too large — please choose one under 2 MB.");
    }
    if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
      throw new ValidationError("Logo must be a PNG or JPEG image.");
    }
    return this.branding.set(logoBytes, mimeType);
  }

  resetToDefault(): Promise<void> {
    return this.branding.clear();
  }
}
