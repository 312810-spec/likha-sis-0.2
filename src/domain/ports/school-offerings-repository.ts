import type { OfferingInput, SchoolOffering } from "../school-offerings";
export interface SchoolOfferingsRepository {
  list(): Promise<SchoolOffering[]>;
  save(input: OfferingInput): Promise<string>;
}
