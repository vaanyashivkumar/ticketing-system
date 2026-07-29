import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Optional label so a boundary can name the subtree it protects (P11 §18). */
  boundaryName?: string;
  /**
   * Region-sized fallback, for boundaries that wrap ONE widget rather than a routed page.
   * Receives a retry so the caller's fallback can offer recovery without reimplementing the reset.
   *
   * Without this a per-widget boundary would render a 60vh "Something went wrong" panel with a
   * "Return to dashboard" button while standing ON the dashboard — which is why B05's
   * "do not block the entire dashboard when only one widget fails" needs a second shape, not a
   * second boundary component.
   */
  fallback?: (retry: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Application-level error boundary (P11 §18). Renders a friendly, recoverable
 * fallback instead of a white screen. No developer detail is shown to end users.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Developer log only — never surfaced to end users (P11 §17).
    console.error(`[ErrorBoundary${this.props.boundaryName ? `:${this.props.boundaryName}` : ''}]`, error, info.componentStack);
  }

  private readonly handleRetry = (): void => this.setState({ hasError: false, error: undefined });
  private readonly handleHome = (): void => {
    window.location.assign('/app/dashboard');
  };

  override render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.handleRetry);
    return (
      <div role="alert" className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-error-bg text-error">
          <AlertTriangle size={24} aria-hidden />
        </span>
        <div className="space-y-1">
          <h2 className="text-h3 text-text">Something went wrong</h2>
          <p className="max-w-md text-body text-text-secondary">
            This part of the application ran into an unexpected problem. Your work has not been
            lost. You can try again or return to the dashboard.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={this.handleRetry}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-body-medium text-primary-on transition-colors duration-base ease-standard hover:bg-primary-hover"
          >
            <RotateCw size={16} aria-hidden /> Try again
          </button>
          <button
            type="button"
            onClick={this.handleHome}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-body-medium text-text transition-colors duration-base ease-standard hover:bg-surface-sunken"
          >
            <Home size={16} aria-hidden /> Return to dashboard
          </button>
        </div>
      </div>
    );
  }
}
