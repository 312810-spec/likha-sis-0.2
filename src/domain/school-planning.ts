export interface SchoolPlanningInput {
  kind: "notice" | "program";
  title: string;
  details: string;
  sourceReference: string;
  effectiveOn: string;
  calendarDecision?: "noChange" | "instructional" | "nonInstructional";
  affectedArea?: string;
  coordinatorUserId: string | null;
  status: "draft" | "confirmed" | "inactive" | "active";
}
export interface SchoolPlanningItem {
  id: string;
  revision: number;
  input: SchoolPlanningInput;
  updatedAt: string;
}
