import { useEffect, useRef, type ReactNode } from "react";

interface PageProps {
  title: string;
  hint?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export function Page({ title, hint, actions, children }: PageProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section aria-label={title} className="page">
      <div className="page-header">
        <h2 ref={headingRef} tabIndex={-1}>
          {title}
        </h2>
        {actions ? <div className="page-actions">{actions}</div> : null}
      </div>
      {hint}
      {children}
    </section>
  );
}
