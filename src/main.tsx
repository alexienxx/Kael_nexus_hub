import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

/**
 * Boot migration — runs once before React mounts.
 * Cleans up old demo/contaminated state from localStorage.
 */
(function bootMigration() {
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
})();

createRoot(document.getElementById("root")!).render(<App />);
