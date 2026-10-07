import { invoke } from "./invoke";
import type { SchoolOfferingsRepository } from "../../domain/ports/school-offerings-repository";
import type { OfferingInput, SchoolOffering } from "../../domain/school-offerings";
export class TauriSchoolOfferingsRepository implements SchoolOfferingsRepository {
  list() {
    return invoke<SchoolOffering[]>("list_school_offerings");
  }
  save(input: OfferingInput) {
    return invoke<string>("save_school_offering", { input });
  }
}
