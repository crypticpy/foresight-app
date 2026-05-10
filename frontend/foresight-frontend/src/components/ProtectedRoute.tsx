import React, { Suspense } from "react";
import { Navigate } from "react-router-dom";
import { useAuthContext } from "../hooks/useAuthContext";
import { ErrorBoundary } from "./ErrorBoundary";
import { PageLoadingSpinner } from "./PageLoadingSpinner";

/**
 * Props for the ProtectedRoute component
 */
export interface ProtectedRouteProps {
  /** The element to render if authenticated */
  element: React.ReactNode;
  /** Optional custom loading message for the spinner */
  loadingMessage?: string;
  /** Path to redirect unauthenticated users to (default: /login) */
  redirectTo?: string;
  /** Whether to wrap in Suspense boundary (default: true) */
  withSuspense?: boolean;
}

/**
 * ProtectedRoute Component
 *
 * A wrapper component that combines authentication checking, Suspense boundaries,
 * and error handling for protected routes. Use this for any route that requires
 * authentication and/or lazy-loading.
 *
 * Features:
 * - Redirects unauthenticated users to login page
 * - Wraps lazy-loaded components in Suspense with loading spinner
 * - Provides ErrorBoundary with retry capability for chunk load failures
 *
 * @example
 * // Basic usage with lazy component
 * <Route
 *   path="/dashboard"
 *   element={<ProtectedRoute element={<Dashboard />} />}
 * />
 *
 * @example
 * // With custom loading message
 * <Route
 *   path="/analytics"
 *   element={
 *     <ProtectedRoute
 *       element={<Analytics />}
 *       loadingMessage="Loading analytics..."
 *     />
 *   }
 * />
 *
 * @example
 * // Synchronous component (no Suspense needed)
 * <Route
 *   path="/"
 *   element={
 *     <ProtectedRoute
 *       element={<Dashboard />}
 *       withSuspense={false}
 *     />
 *   }
 * />
 */
export function ProtectedRoute({
  element,
  loadingMessage,
  redirectTo = "/login",
  withSuspense = true,
}: ProtectedRouteProps) {
  const { user } = useAuthContext();

  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to={redirectTo} replace />;
  }

  // Render with or without Suspense based on prop
  const content = withSuspense ? (
    <Suspense fallback={<PageLoadingSpinner message={loadingMessage} />}>
      {element}
    </Suspense>
  ) : (
    element
  );

  // Passing a no-op onRetry is the documented signal that tells
  // ErrorBoundary to render its retry button — the boundary already
  // resets its own state and re-mounts the children, which gives
  // React.lazy another chance to load the chunk.
  return <ErrorBoundary onRetry={() => {}}>{content}</ErrorBoundary>;
}

export default ProtectedRoute;
