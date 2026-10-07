import { invoke } from "./invoke";
import type { SchoolPlanningInput, SchoolPlanningItem } from "../../domain/school-planning";
import type { SchoolPlanningRepository } from "../../domain/ports/school-planning-repository";
export class TauriSchoolPlanningRepository implements SchoolPlanningRepository {
 list():Promise<SchoolPlanningItem[]> { return invoke("list_school_planning_items"); }
 save(input:SchoolPlanningInput,id?:string,expectedRevision?:number):Promise<SchoolPlanningItem> { return invoke("save_school_planning_item",{input,id:id??null,expectedRevision:expectedRevision??null}); }
}
