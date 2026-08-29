import { invoke } from "./invoke";
import type { SchoolBranding, SchoolLogo } from "../../domain/school-branding";
import type { SchoolBrandingRepository } from "../../domain/ports/school-branding-repository";

/** Tauri/SQLite implementation of {@link SchoolBrandingRepository}. */
export class TauriSchoolBrandingRepository implements SchoolBrandingRepository {
  get(): Promise<SchoolBranding | null> {
    return invoke<SchoolBranding | null>("get_school_branding");
  }

  async getLogo(): Promise<SchoolLogo | null> {
    const result = await invoke<[number[], string] | null>("get_school_logo");
    if (result === null) {
      return null;
    }
    const [bytes, mimeType] = result;
    return { bytes: new Uint8Array(bytes), mimeType };
  }

  set(logoBytes: Uint8Array, mimeType: string): Promise<SchoolBranding> {
    return invoke<SchoolBranding>("set_school_branding", {
      logoBytes: Array.from(logoBytes),
      logoMime: mimeType,
    });
  }

  clear(): Promise<void> {
    return invoke<void>("clear_school_branding");
  }
}
