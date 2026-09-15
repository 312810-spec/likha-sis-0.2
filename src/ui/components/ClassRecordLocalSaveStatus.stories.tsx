import { ClassRecordLocalSaveStatus } from "./ClassRecordLocalSaveStatus";

export function SavedLocallyExample() {
  return <ClassRecordLocalSaveStatus savedAt="2026-09-15T09:30:00.000Z" />;
}

export function SavingExample() {
  return <ClassRecordLocalSaveStatus savedAt="2026-09-15T09:30:00.000Z" isSaving />;
}
