import { Component, type ErrorInfo, type ReactNode } from "react";
import { errorCopy } from "../theme/copy";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional override when the boundary knows a better recovery sentence. */
  message?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * The one React error boundary in the app (CTOS M03).
 *
 * Before this existed, a render-time throw anywhere in a screen took the whole
 * application down — the shell, the navigation, and every other tab with it —
 * because React unmounts the entire tree above the nearest boundary, and there
 * wasn't one. This keeps a failure scoped to the screen that failed and leaves
 * the teacher able to navigate away.
 *
 * Deliberate choices:
 *
 * - Renders an `Alert` in the error tone, not a bespoke crash page, so a
 *   component failure reads the same as any other failure the teacher might
 *   meet.
 * - `role="alert"` (from `Alert`) means the message is announced immediately,
 *   which is right: a screen silently replaced by a blank area is worse than
 *   one that announces what happened.
 * - Reports the error message rather than swallowing it. This is a local
 *   teacher workstation with no telemetry path, so surfacing the text is the
 *   only way the teacher can tell a maintainer what actually broke.
 * - Class-scoped to this component: this boundary exists to protect against
 *   render failures, which are the failures a boundary can catch. Async
 *   service failures are handled by each screen's own error state, and those
 *   paths already exist and are tested.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Logged rather than swallowed; see the docstring above.
    console.error("ErrorBoundary caught a render failure.", error, info.componentStack);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const message = this.props.message ?? errorCopy.notFound;
    return (
      <div className="error-boundary" role="region" aria-label="This screen failed to render">
        <p className="error-boundary-message">{message}</p>
        <p className="error-boundary-detail">{error.message}</p>
        <button type="button" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}
