import type { SchedulePlanInput } from "../domain/schedule-plan";
export function emptySchedulePlan(): SchedulePlanInput {
  return {
    label: "",
    schoolYear: "",
    termLabel: "",
    effectiveFrom: "",
    effectiveUntil: "",
    dataConfirmed: false,
    teachers: [],
    rooms: [],
    slots: [],
    courses: [],
    locks: [],
  };
}
