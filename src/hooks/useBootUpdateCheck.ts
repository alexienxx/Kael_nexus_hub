import { useState, useEffect } from "react";
import { checkForUpdatesSilent, type UpdateCheckResult } from "@/lib/api/updates";
import { API_CONFIG_CHANGED_EVENT, BACKEND_ROUTE_CHANGED_EVENT } from "@/lib/api/client";
import { App as CapacitorApp } from "@capacitor/app";
import { checkNativeUpdatesNow, configureNativeUpdates, isNativeUpdatePlatform } from "@/lib/nativeUpdater";

const BOOT_CHECK_DELAY_MS = 5000;

/**
 * Checks for updates silently ~5s after mount.
 * Android delegates background work to its existing native job owner. Web only
 * offers the validated manual download dialog; scheduling is not installation.
 */
export function useBootUpdateCheck() {
  const [showDialog, setShowDialog] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (isNativeUpdatePlatform()) {
        try {
          const status = await configureNativeUpdates();
          if (status.enabled && !cancelled) await checkNativeUpdatesNow();
        } catch { /* Native status remains available in Settings; no false success. */ }
        return;
      }
      const res = await checkForUpdatesSilent();
      if (!cancelled && res?.updateAvailable && res.manifest) {
        setResult(res);
        setShowDialog(true);
      }
    };
    const timer = setTimeout(() => { void run(); }, BOOT_CHECK_DELAY_MS);
    const refreshNative = () => { if (isNativeUpdatePlatform()) void run(); };
    window.addEventListener(BACKEND_ROUTE_CHANGED_EVENT, refreshNative);
    window.addEventListener(API_CONFIG_CHANGED_EVENT, refreshNative);
    const listener = isNativeUpdatePlatform()
      ? CapacitorApp.addListener("appStateChange", ({ isActive }) => { if (isActive) refreshNative(); })
      : null;

    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener(BACKEND_ROUTE_CHANGED_EVENT, refreshNative);
      window.removeEventListener(API_CONFIG_CHANGED_EVENT, refreshNative);
      void listener?.then((handle) => handle.remove()).catch(() => {});
    };
  }, []);

  return { result, showDialog, setShowDialog };
}
