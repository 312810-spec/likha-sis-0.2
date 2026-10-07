import type { CSSProperties } from "react";

interface SkeletonProps {
  label: string;
  lines?: number;
  compact?: boolean;
}

/**
 * Content-shaped loading placeholder. It is decorative visually but exposes
 * one concise live status label so assistive technology is not forced to
 * traverse placeholder fragments.
 */
export function Skeleton({ label, lines = 3, compact = false }: SkeletonProps) {
  const safeLines = Math.max(1, Math.min(lines, 8));
  return (
    <div
      className={compact ? "skeleton skeleton-compact" : "skeleton"}
      role="status"
      aria-label={label}
    >
      <span className="visually-hidden">{label}</span>
      <div className="skeleton-heading" aria-hidden="true" />
      {Array.from({ length: safeLines }, (_, index) => (
        <div
          key={index}
          className="skeleton-line"
          aria-hidden="true"
          style={{ "--skeleton-line": String(Math.max(54, 94 - index * 9)) + "%" } as CSSProperties}
        />
      ))}
    </div>
  );
}
