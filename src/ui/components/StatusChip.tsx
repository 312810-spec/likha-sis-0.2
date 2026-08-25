import type { ReactNode } from "react";

export type StatusChipTone = "neutral" | "productive" | "success" | "warning" | "danger";

interface StatusChipProps {
  tone: StatusChipTone;
  children: ReactNode;
}

/**
 * A short, at-a-glance state label -- e.g. an attendance-marking status
 * or a sign-in-activity event type. The text itself always carries the
 * meaning (WCAG 1.4.1, Use of Color); tone is an additive visual cue,
 * never the only signal.
 */
export function StatusChip({ tone, children }: StatusChipProps) {
  return <span className={`status-chip status-chip-${tone}`}>{children}</span>;
}
