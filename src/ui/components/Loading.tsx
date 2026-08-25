/**
 * Consolidates this app's repeated `<p role="status">Loading X…</p>`
 * pattern (13 near-identical occurrences across screens before this
 * component existed) into one component. `role="status"` matches every
 * existing call site exactly.
 */
export function Loading({ label }: { label: string }) {
  return (
    <p className="loading-state" role="status">
      {label}
    </p>
  );
}
