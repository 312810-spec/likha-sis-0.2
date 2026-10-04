import type { SchoolPlanningInput, SchoolPlanningItem } from "../domain/school-planning";
import type { SchoolPlanningRepository } from "../domain/ports/school-planning-repository";
import { ValidationError } from "../domain/errors";
export class SchoolPlanningApplicationService {
 constructor(private readonly repository:SchoolPlanningRepository) {}
 list():Promise<SchoolPlanningItem[]> { return this.repository.list(); }
 save(input:SchoolPlanningInput,id?:string,expectedRevision?:number):Promise<SchoolPlanningItem> {
  if (!input.title.trim()) throw new ValidationError("Enter a notice or program name.");
  if (input.status === "confirmed" && (!input.sourceReference.trim() || !input.effectiveOn)) throw new ValidationError("A confirmed notice needs its source and effective date.");
  if (input.status === "active" && (!input.sourceReference.trim() || !input.details.trim() || !input.coordinatorUserId)) throw new ValidationError("An active program needs school instructions and a designated coordinator.");
  return this.repository.save(input,id,expectedRevision);
 }
}
