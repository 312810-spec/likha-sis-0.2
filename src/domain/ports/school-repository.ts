import type { School } from "../school";

/**
 * Repository port for schools. UI and application code depend only on this
 * interface, never on the concrete Tauri/SQLite adapter that implements it.
 */
export interface SchoolRepository {
  listAll(): Promise<School[]>;
  create(name: string): Promise<School>;
}
