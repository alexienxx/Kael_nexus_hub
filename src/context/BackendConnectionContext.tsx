/**
 * BackendConnectionContext — global backend lifecycle state.
 *
 * Single instance of useBackendLifecycle shared across the whole app.
 * Mount the provider in AppShell so ALL pages share the same state and
 * the visibilitychange listener runs regardless of which page is active.
 *
 * Consumers:
 *   const { state, message, retry } = useBackendConnection();
 */

import { createContext, useContext, type ReactNode } from "react";
import { useBackendLifecycle, type BackendLifecycleResult } from "@/hooks/useBackendLifecycle";

const BackendConnectionContext = createContext<BackendLifecycleResult | null>(null);

export function BackendConnectionProvider({ children }: { children: ReactNode }) {
  const lifecycle = useBackendLifecycle();
  return (
    <BackendConnectionContext.Provider value={lifecycle}>
      {children}
    </BackendConnectionContext.Provider>
  );
}

export function useBackendConnection(): BackendLifecycleResult {
  const ctx = useContext(BackendConnectionContext);
  if (!ctx) {
    throw new Error(
      "useBackendConnection must be used inside <BackendConnectionProvider>. " +
      "Check that AppShell wraps the routes."
    );
  }
  return ctx;
}
