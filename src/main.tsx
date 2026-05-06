import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

/**
 * Boot diagnostics — silent, console-only.
 *
 * Errors are NEVER painted on screen. The user must never see a stack trace.
 * Diagnostics flow only through the browser console, captured by:
 *   - chrome://inspect (USB-debug WebView)
 *   - adb logcat -s chromium (when WebView debugging is enabled)
 *
 * Trace markers:
 *   [KAEL_BOOT] start | migration ok | createRoot ok | render ok
 *   [KAEL_BOOT_FATAL] <stage>: <message>
 */
function logFatal(stage: string, err: unknown): void {
  try {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error && err.stack ? err.stack : "(no stack)";
    // eslint-disable-next-line no-console
    console.error("[KAEL_BOOT_FATAL]", stage, msg, stack);
  } catch {
    /* swallow — last-resort path */
  }
}

// Global handlers — log only, never paint.
window.addEventListener("error", (ev) => logFatal("window.error", ev.error ?? ev.message));
window.addEventListener("unhandledrejection", (ev) => logFatal("unhandledrejection", ev.reason));

// eslint-disable-next-line no-console
console.log("[KAEL_BOOT] start");

/**
 * Boot migration — runs once before React mounts.
 * Cleans up old demo/contaminated state from localStorage.
 */
function bootMigration(): void {
  const MIGRATION_KEY = "kael_boot_migration_v3";
  if (localStorage.getItem(MIGRATION_KEY)) return; // already migrated

  // 1. Backend config: RESET to empty so auto-discovery can find port 8002.
  //    v3: always clear stale URLs (e.g. old :8000 from previous builds).
  //    Discovery will re-scan KNOWN_HOSTS × PORT_RANGE and persist the correct one.
  const configKey = "kael-backend-config";
  localStorage.setItem(configKey, JSON.stringify({ baseUrl: "", apiKey: "" }));

  // 2. Ensure session ID is canonical
  const sessionKey = "kael_session_id";
  const stored = localStorage.getItem(sessionKey);
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!stored || uuidRe.test(stored)) {
    localStorage.setItem(sessionKey, "mobile_kael");
  }

  // 3. Remove leftover Supabase/Lovable auth tokens
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith("sb-") || key.includes("supabase"))) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));

  // Mark migration as done
  localStorage.setItem(MIGRATION_KEY, new Date().toISOString());
  console.log("[KAEL_BOOT] Migration v3 complete — URL reset, discovery active");
}

try {
  bootMigration();
} catch (err) {
  // Don't paint fatal yet — migration failure shouldn't kill the app.
  // Just log and continue to mount; the app can still work without migration.
  // eslint-disable-next-line no-console
  console.error("[KAEL_BOOT] migration failed (non-fatal):", err);
}

try {
  // eslint-disable-next-line no-console
  console.log("[KAEL_BOOT] migration ok");
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("getElementById('root') returned null");
  const reactRoot = createRoot(rootEl);
  // eslint-disable-next-line no-console
  console.log("[KAEL_BOOT] createRoot ok");
  reactRoot.render(<App />);
  // eslint-disable-next-line no-console
  console.log("[KAEL_BOOT] render ok");
} catch (err) {
  logFatal("mount", err);
}
