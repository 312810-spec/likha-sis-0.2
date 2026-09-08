import { ValidationError } from "../domain/errors";
import type { SchoolCoordinatesRepository } from "../domain/ports/school-coordinates-repository";
import { isValidCoordinate, type SchoolCoordinates } from "../domain/school-coordinates";

/**
 * Orchestrates the school-coordinates use case (Batch 8 item 5,
 * ADR-0079). UI code depends on this, never directly on a
 * `SchoolCoordinatesRepository` — same validate-before-repository-call
 * shape as `SchoolLogoApplicationService`. This is a UX convenience
 * only: the backend command (`set_school_coordinates`) re-validates the
 * range itself and stays authoritative.
 */
export class SchoolCoordinatesApplicationService {
  constructor(private readonly coordinates: SchoolCoordinatesRepository) {}

  getCoordinates(): Promise<SchoolCoordinates | null> {
    return this.coordinates.get();
  }

  async setCoordinates(latitude: number, longitude: number): Promise<void> {
    if (!isValidCoordinate(latitude, longitude)) {
      throw new ValidationError("Enter a valid latitude (-90..90) and longitude (-180..180).");
    }
    await this.coordinates.set(latitude, longitude);
  }

  clearCoordinates(): Promise<void> {
    return this.coordinates.clear();
  }
}
