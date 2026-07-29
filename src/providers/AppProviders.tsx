import type { ReactNode } from 'react';
import { ThemeProvider } from './ThemeProvider';
import { ErrorBoundary } from './ErrorBoundary';

/**
 * Root provider composition (P11 §6). Kept flat and modular.
 *
 * Implemented in this foundation phase: Theme, Error Boundary.
 * Seams reserved for later feature phases (added here as they land, never earlier):
 *   Authentication · Permissions · Notifications · Dashboard · Application Settings
 *   · Future API Client · Future Feature Flags.
 * These are intentionally NOT stubbed with fake business state — the foundation
 * establishes the composition point; each provider arrives with its feature.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary boundaryName="root">
      <ThemeProvider>{children}</ThemeProvider>
    </ErrorBoundary>
  );
}
