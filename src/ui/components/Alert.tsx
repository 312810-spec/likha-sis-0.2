import type { ReactNode } from "react";

type AlertTone = "error" | "success" | "warning" | "info";

interface AlertProps {
  tone: AlertTone;
  /** Most banners hold arbitrary block content (one or more paragraphs,
   * a list of disclosed export limitations) and must stack vertically,
   * which is this component's default. `inline` is for the one shape
   * that genuinely needs a message sitting beside a single action button
   * (e.g. the idle-timeout warning's "message + Stay signed in"). */
  inline?: boolean;
  /** Lets a caller move focus to this banner when it appears (e.g. an
   * action taken far down a long list) via `document.getElementById`,
   * the same pattern this app's other focus-restoration effects already
   * use. Optional -- most call sites don't need it. */
  id?: string;
  children: ReactNode;
}

/**
 * Consolidates this app's three near-identical banner patterns
 * (`.error-banner`, `.confirmation-banner`, `.idle-timeout-warning`)
 * into one component with the same ARIA semantics each already had --
 * see docs/adr/0031-design-system-and-app-shell.md. `error`/`warning`
 * are `role="alert"` (interrupts, announced immediately); `success`/
 * `info` are `role="status"` (announced without interrupting) --
 * exactly the roles every existing call site already used, not a new
 * choice made here.
 */
export function Alert({ tone, inline = false, id, children }: AlertProps) {
  const role = tone === "error" || tone === "warning" ? "alert" : "status";
  const className = `alert alert-${tone}${inline ? " alert-inline" : ""}`;
  return (
    <div id={id} className={className} role={role} tabIndex={-1}>
      {children}
    </div>
  );
}
