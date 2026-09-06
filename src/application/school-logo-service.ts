import { ValidationError } from "../domain/errors";
import type { SchoolLogoRepository } from "../domain/ports/school-logo-repository";
import { ALLOWED_LOGO_MIME_TYPES, MAX_LOGO_BYTES, type SchoolLogo } from "../domain/school-logo";

/**
 * Orchestrates the school-branding-logo use case. UI code depends on
 * this, never directly on a `SchoolLogoRepository` — the same
 * validate-before-repository-call shape every other application
 * service in this codebase follows (see `.claude/rules/architecture.md`).
 * This is a UX convenience only: the backend command (`set_school_logo`)
 * re-validates size and MIME type itself and stays authoritative.
 */
export class SchoolLogoApplicationService {
  constructor(private readonly logos: SchoolLogoRepository) {}

  getLogo(): Promise<SchoolLogo | null> {
    return this.logos.get();
  }

  async setLogo(mime: string, bytes: Uint8Array): Promise<void> {
    if (!(ALLOWED_LOGO_MIME_TYPES as readonly string[]).includes(mime)) {
      throw new ValidationError("Logo must be a PNG, JPEG, or WebP image.");
    }
    if (bytes.length === 0) {
      throw new ValidationError("Choose an image file to upload.");
    }
    if (bytes.length > MAX_LOGO_BYTES) {
      throw new ValidationError(`Logo must be at most ${Math.floor(MAX_LOGO_BYTES / 1024)} KB.`);
    }
    await this.logos.set(mime, bytes);
  }

  clearLogo(): Promise<void> {
    return this.logos.clear();
  }
}
