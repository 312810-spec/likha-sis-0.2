import { ValidationError } from "../domain/errors";
import type { Subject } from "../domain/subject";
import type { SubjectRepository } from "../domain/ports/subject-repository";

const MAX_NAME_LENGTH = 100;

/**
 * Orchestrates subject-related use cases. UI code depends on this, never
 * directly on a `SubjectRepository`. School scope is never a parameter
 * here — it comes from the caller's authenticated session on the Rust
 * side. See `SectionApplicationService` for the same convention.
 */
export class SubjectApplicationService {
  constructor(private readonly subjects: SubjectRepository) {}

  async createSubject(name: string): Promise<Subject> {
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      throw new ValidationError("Subject name is required.");
    }
    if (trimmedName.length > MAX_NAME_LENGTH) {
      throw new ValidationError(`Subject name must be at most ${MAX_NAME_LENGTH} characters.`);
    }

    return this.subjects.create(trimmedName);
  }

  listSubjects(): Promise<Subject[]> {
    return this.subjects.list();
  }
}
