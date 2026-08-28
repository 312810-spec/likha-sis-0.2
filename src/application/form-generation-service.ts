import { ValidationError } from "../domain/errors";
import type { Sf1GenerationResult, Sf9GenerationResult } from "../domain/form-generation";
import type { FormGenerationRepository } from "../domain/ports/form-generation-repository";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Orchestrates official-form (SF1/SF9) generation. UI code depends on
 * this, never directly on a {@link FormGenerationRepository}. Validates
 * only the shape of the request (ids present, date well-formed); the
 * Rust side is authoritative on school scope, section/learner
 * resolution, and active-membership eligibility — those come back as a
 * `null` result, not a thrown error, matching `ExportApplicationService`'s
 * established convention for this exact "not found in this school"
 * shape.
 */
export class FormGenerationApplicationService {
  constructor(private readonly forms: FormGenerationRepository) {}

  async generateSf1(sectionId: string, asOfDate: string): Promise<Sf1GenerationResult | null> {
    const trimmedSectionId = sectionId.trim();
    if (trimmedSectionId.length === 0) {
      throw new ValidationError("Section is required.");
    }
    if (!DATE_PATTERN.test(asOfDate)) {
      throw new ValidationError("Date must be in YYYY-MM-DD format.");
    }

    return this.forms.generateSf1(trimmedSectionId, asOfDate);
  }

  async generateSf9(
    sectionId: string,
    learnerId: string,
    asOfDate: string,
  ): Promise<Sf9GenerationResult | null> {
    const trimmedSectionId = sectionId.trim();
    const trimmedLearnerId = learnerId.trim();
    if (trimmedSectionId.length === 0) {
      throw new ValidationError("Section is required.");
    }
    if (trimmedLearnerId.length === 0) {
      throw new ValidationError("Learner is required.");
    }
    if (!DATE_PATTERN.test(asOfDate)) {
      throw new ValidationError("Date must be in YYYY-MM-DD format.");
    }

    return this.forms.generateSf9(trimmedSectionId, trimmedLearnerId, asOfDate);
  }
}
