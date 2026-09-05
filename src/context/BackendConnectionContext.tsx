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

import type { ReactNode } from "react";
import { useBackendLifecycle } from "@/hooks/useBackendLifecycle";
import { BackendConnectionContext } from "@/context/backend-connection";

export function BackendConnectionProvider({ children }: { children: ReactNode }) {
  const lifecycle = useBackendLifecycle();
  return (
    <BackendConnectionContext.Provider value={lifecycle}>
      {children}
    </BackendConnectionContext.Provider>
  );
}
