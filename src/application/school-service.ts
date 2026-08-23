import { ValidationError } from "../domain/errors";
import type { SchoolRepository } from "../domain/ports/school-repository";
import type { School } from "../domain/school";

const MAX_NAME_LENGTH = 200;

/**
 * Orchestrates school-related use cases. UI code depends on this, never
 * directly on a `SchoolRepository` — validation and any future multi-step
 * business rules live here, not in the UI and not in the repository.
 */
export class SchoolApplicationService {
  constructor(private readonly schools: SchoolRepository) {}

  async registerSchool(name: string): Promise<School> {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new ValidationError("School name must not be empty.");
    }
    if (trimmed.length > MAX_NAME_LENGTH) {
      throw new ValidationError(`School name must be at most ${MAX_NAME_LENGTH} characters.`);
    }
    return this.schools.create(trimmed);
  }

  listAll(): Promise<School[]> {
    return this.schools.listAll();
  }
}
