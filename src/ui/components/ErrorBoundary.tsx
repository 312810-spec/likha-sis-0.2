import { Component, createRef, type ReactNode } from "react";
interface ErrorBoundaryProps {
  children: ReactNode;
  message?: string;
}
interface ErrorBoundaryState {
  error: Error | null;
}
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };
  private alert = createRef<HTMLDivElement>();
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }
  override componentDidCatch() {
    this.alert.current?.focus();
  }
  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div ref={this.alert} tabIndex={-1} className="error-boundary" role="alert">
        <p>{this.props.message ?? "This screen could not be shown."}</p>
        <p>Your other screens are still available. Try again or choose another destination.</p>
        <button type="button" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}
