import { invoke } from "./invoke";
import type { School } from "../../domain/school";
import type { SchoolRepository } from "../../domain/ports/school-repository";

/** Tauri/SQLite implementation of {@link SchoolRepository}. */
export class TauriSchoolRepository implements SchoolRepository {
  listAll(): Promise<School[]> {
    return invoke<School[]>("list_schools");
  }

  create(name: string): Promise<School> {
    return invoke<School>("create_school", { name });
  }
}
