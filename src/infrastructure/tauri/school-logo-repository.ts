import { invoke } from "./invoke";
import type { SchoolLogoRepository } from "../../domain/ports/school-logo-repository";
import type { SchoolLogo } from "../../domain/school-logo";

interface SchoolLogoDto {
  mime: string;
  bytes: number[];
}

/** Tauri/SQLite implementation of {@link SchoolLogoRepository}. Logo
 * bytes cross the IPC boundary as a plain JSON number array (matching
 * Rust's `Vec<u8>`) rather than base64 — simplest correct choice for a
 * size-capped image and it avoids adding a base64 dependency on either
 * side for a feature this small. */
export class TauriSchoolLogoRepository implements SchoolLogoRepository {
  async get(): Promise<SchoolLogo | null> {
    const dto = await invoke<SchoolLogoDto | null>("get_school_logo");
    if (dto === null) {
      return null;
    }
    return { mime: dto.mime, bytes: Uint8Array.from(dto.bytes) };
  }

  set(mime: string, bytes: Uint8Array): Promise<void> {
    return invoke<void>("set_school_logo", { mime, bytes: Array.from(bytes) });
  }

  clear(): Promise<void> {
    return invoke<void>("clear_school_logo");
  }
}
