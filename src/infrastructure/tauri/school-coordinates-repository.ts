import { invoke } from "./invoke";
import type { SchoolCoordinatesRepository } from "../../domain/ports/school-coordinates-repository";
import type { SchoolCoordinates } from "../../domain/school-coordinates";

/** Tauri/SQLite implementation of {@link SchoolCoordinatesRepository}.
 * Only `src/composition.ts` may import this class directly — UI/
 * application code depends on the port instead. */
export class TauriSchoolCoordinatesRepository implements SchoolCoordinatesRepository {
  get(): Promise<SchoolCoordinates | null> {
    return invoke<SchoolCoordinates | null>("get_school_coordinates");
  }

  set(latitude: number, longitude: number): Promise<void> {
    return invoke<void>("set_school_coordinates", { latitude, longitude });
  }

  clear(): Promise<void> {
    return invoke<void>("clear_school_coordinates");
  }
}
