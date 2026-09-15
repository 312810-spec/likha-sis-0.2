interface LocalSaveStatusProps {
  savedAt?: string | null;
}

function formatSavedTime(savedAt: string): string | null {
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Teacher-facing confirmation for a write that has committed to LIKHA's
 * local working database. Deliberately does not claim "Synced" or
 * "Waiting to sync": those states require evidence from the sync boundary.
 */
export function LocalSaveStatus({ savedAt }: LocalSaveStatusProps) {
  const savedTime = savedAt ? formatSavedTime(savedAt) : null;

  return (
    <span className="score-saved-note" role="status">
      Saved on this device{savedTime ? ` · ${savedTime}` : ""}
    </span>
  );
}
