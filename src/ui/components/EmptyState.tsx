import type { ReactNode } from "react";

interface EmptyStateProps {
  children?: ReactNode;
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  tone?: "empty" | "success";
}

/**
 * A quiet no-data/successful-zero-state primitive. Existing children-only
 * call sites keep their original paragraph semantics; richer screens can
 * provide a title, explanation, and one purposeful next action without
 * inventing data or making the absence look like an error.
 */
export function EmptyState({
  children,
  title,
  description,
  action,
  tone = "empty",
}: EmptyStateProps) {
  if (!title && description === undefined && action === undefined && tone === "empty") {
    return <p className="empty-state">{children}</p>;
  }

  return (
    <section className="empty-state empty-state-structured" data-tone={tone} aria-label={title}>
      {title ? <h3>{title}</h3> : null}
      {description !== undefined ? (
        <div className="empty-state-description">{description}</div>
      ) : null}
      {children ? <div className="empty-state-description">{children}</div> : null}
      {action ? <div className="empty-state-action">{action}</div> : null}
    </section>
  );
}
