import { createContext, useContext } from "react";
import type { BackendLifecycleResult } from "@/hooks/useBackendLifecycle";

export const BackendConnectionContext = createContext<BackendLifecycleResult | null>(null);

export function useBackendConnection(): BackendLifecycleResult {
  const context = useContext(BackendConnectionContext);
  if (!context) {
    throw new Error(
      "useBackendConnection must be used inside <BackendConnectionProvider>. " +
        "Check that AppShell wraps the routes.",
    );
  }
  return context;
}
