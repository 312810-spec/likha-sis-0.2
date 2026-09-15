import { LocalSaveStatus } from "./LocalSaveStatus";

interface ClassRecordLocalSaveStatusProps {
  savedAt?: string | null;
  hasError?: boolean;
  isSaving?: boolean;
}

/**
 * Bounded Class Record adapter for the local-persistence vocabulary.
 * It renders confirmation only after a row has durable local-write evidence
 * and never infers sync state from UI/network state.
 */
export function ClassRecordLocalSaveStatus({
  savedAt,
  hasError = false,
  isSaving = false,
}: ClassRecordLocalSaveStatusProps) {
  if (!savedAt || hasError || isSaving) return null;
  return <LocalSaveStatus savedAt={savedAt} />;
}
