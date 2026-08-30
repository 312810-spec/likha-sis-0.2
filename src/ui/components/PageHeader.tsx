import { forwardRef, useEffect, useImperativeHandle, useRef, type ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  hint?: ReactNode;
}

/** Lets a parent screen move focus back to this heading imperatively --
 * e.g. after a "Try again" retry button unmounts itself, which would
 * otherwise drop keyboard focus to `<body>` per the HTML spec's
 * remove-focused-element behavior. Mirrors the `headingRef.current?.focus()`
 * pattern every screen with its own inline heading already uses. */
export interface PageHeaderHandle {
  focus: () => void;
}

/**
 * The heading + mount-focus + optional Guided-mode-hint pattern every
 * screen in this app already repeats individually. Moves focus to the
 * heading on mount (same accessibility rationale each screen's own
 * inline version already had -- a clear signal the screen changed for
 * keyboard/screen-reader users) so a migrated screen's behavior is
 * unchanged, not just its markup.
 */
export const PageHeader = forwardRef<PageHeaderHandle, PageHeaderProps>(function PageHeader(
  { title, hint },
  ref,
) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useImperativeHandle(ref, () => ({
    focus: () => headingRef.current?.focus(),
  }));

  return (
    <div className="page-header">
      <h2 ref={headingRef} tabIndex={-1}>
        {title}
      </h2>
      {hint}
    </div>
  );
});
