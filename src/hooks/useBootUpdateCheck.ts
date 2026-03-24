import { useState, useEffect, useRef } from "react";
import { checkForUpdatesSilent, type UpdateCheckResult } from "@/lib/api/updates";

const BOOT_CHECK_DELAY_MS = 5000;

/**
 * Checks for updates silently ~5s after mount.
 * If an update is available, auto-opens the UpdateDialog.
 */
export function useBootUpdateCheck() {
  const [showDialog, setShowDialog] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    const timer = setTimeout(async () => {
      const res = await checkForUpdatesSilent();
      if (res?.updateAvailable && res.manifest) {
        setResult(res);
        setShowDialog(true);
      }
    }, BOOT_CHECK_DELAY_MS);

    return () => clearTimeout(timer);
  }, []);

  return { result, showDialog, setShowDialog };
}
