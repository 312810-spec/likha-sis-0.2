import type { ReactNode } from "react";

/**
 * Consolidates this app's repeated "nothing here yet" plain-paragraph
 * pattern (8 screens before this component existed) into one component
 * with a consistent, deliberately quiet visual treatment -- distinct
 * from an error, so a teacher scanning the screen doesn't mistake "no
 * sections created yet" for something having gone wrong.
 */
export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="empty-state">{children}</p>;
}
