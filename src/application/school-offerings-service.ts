import type { SchoolOfferingsRepository } from "../domain/ports/school-offerings-repository";
import type { OfferingInput } from "../domain/school-offerings";
import { ValidationError } from "../domain/errors";
export class SchoolOfferingsApplicationService {
  constructor(private readonly repository: SchoolOfferingsRepository) {}
  list() {
    return this.repository.list();
  }
  save(input: OfferingInput) {
    if (
      !Number.isInteger(input.weeklyMinutes) ||
      input.weeklyMinutes < 1 ||
      input.weeklyMinutes > 2400
    )
      throw new ValidationError("Enter weekly minutes from 1 to 2400.");
    if (input.verificationState === "school_confirmed" && !input.sourceReference.trim())
      throw new ValidationError("School confirmation requires a source reference.");
    return this.repository.save(input);
  }
}
