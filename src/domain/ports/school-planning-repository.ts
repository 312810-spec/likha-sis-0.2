import type { SchoolPlanningInput,SchoolPlanningItem } from "../school-planning";
export interface SchoolPlanningRepository {
 list(): Promise<SchoolPlanningItem[]>;
 save(input:SchoolPlanningInput,id?:string,expectedRevision?:number):Promise<SchoolPlanningItem>;
}
