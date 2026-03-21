import { useState } from "react";

/**
 * Stub hook for boot-time update checks.
 * Will be wired to the actual update API when backend supports it.
 */
export function useBootUpdateCheck() {
  const [showDialog, setShowDialog] = useState(false);
  const [result] = useState<{ manifest: null }>({ manifest: null });

  return { result, showDialog, setShowDialog };
}
