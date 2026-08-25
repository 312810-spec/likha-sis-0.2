import { useEffect, useRef, type ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  hint?: ReactNode;
}

/**
 * The heading + mount-focus + optional Guided-mode-hint pattern every
 * screen in this app already repeats individually. Moves focus to the
 * heading on mount (same accessibility rationale each screen's own
 * inline version already had -- a clear signal the screen changed for
 * keyboard/screen-reader users) so a migrated screen's behavior is
 * unchanged, not just its markup.
 */
export function PageHeader({ title, hint }: PageHeaderProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="page-header">
      <h2 ref={headingRef} tabIndex={-1}>
        {title}
      </h2>
      {hint}
    </div>
  );
}
