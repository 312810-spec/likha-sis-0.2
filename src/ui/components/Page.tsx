import { useEffect, useRef, type ReactNode, type RefObject } from "react";

interface PageProps {
  title: string;
  /** Embedded panes retain the initiating tab/button focus while data loads. */
  autoFocus?: boolean;
  hint?: ReactNode;
  actions?: ReactNode;
  /** Optional: caller-owned ref to the page <h2>, so the screen can
   *  return focus to the heading after an action. When omitted, Page
   *  manages its own heading ref. Page focuses the heading on mount
   *  unless autoFocus is disabled for an embedded pane. */
  headingRef?: RefObject<HTMLHeadingElement | null>;
  children: ReactNode;
}

export function Page({ title, hint, actions, headingRef, children, autoFocus = true }: PageProps) {
  const internalRef = useRef<HTMLHeadingElement>(null);
  const ref = headingRef ?? internalRef;

  useEffect(() => {
    if (autoFocus && !ref.current?.closest("[hidden]")) ref.current?.focus();
  }, [ref, autoFocus]);

  return (
    <section aria-label={title} className="page">
      <div className="page-header">
        <h2 ref={ref} tabIndex={-1}>
          {title}
        </h2>
        {actions ? <div className="page-actions">{actions}</div> : null}
      </div>
      {hint}
      {children}
    </section>
  );
}
