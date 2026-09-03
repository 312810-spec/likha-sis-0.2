import { useEffect, useRef, type ReactNode, type RefObject } from "react";

interface PageProps {
  title: string;
  hint?: ReactNode;
  actions?: ReactNode;
  /** Optional: caller-owned ref to the page <h2>, so the screen can
   *  return focus to the heading after an action. When omitted, Page
   *  manages its own heading ref. Either way, Page moves focus to the
   *  heading on mount. */
  headingRef?: RefObject<HTMLHeadingElement | null>;
  children: ReactNode;
}

export function Page({ title, hint, actions, headingRef, children }: PageProps) {
  const internalRef = useRef<HTMLHeadingElement>(null);
  const ref = headingRef ?? internalRef;

  useEffect(() => {
    ref.current?.focus();
  }, [ref]);

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
