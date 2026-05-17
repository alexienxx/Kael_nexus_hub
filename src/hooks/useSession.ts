import { useEffect, useState } from "react";

const STORAGE_KEY = "kael_session_id";

/**
 * Canonical session ID for the Kael mobile client.
 * All chat history, memory, and backend state uses this ID.
 */
const CANONICAL_SESSION_ID = "mobile_kael";

/**
 * Detect if a stored session looks like an old random UUID (not canonical).
 */
function isRandomUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Hook for persistent session management.
 * Uses the canonical session_id "mobile_kael" for backend continuity.
 * Migrates old random UUIDs to the canonical ID automatically.
 */
export function useSession() {
  const [sessionId, setSessionId] = useState<string>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);

    // Migration: if stored session is a random UUID, replace with canonical
    if (!stored || isRandomUUID(stored)) {
      localStorage.setItem(STORAGE_KEY, CANONICAL_SESSION_ID);
      return CANONICAL_SESSION_ID;
    }

    // Hard-lock to canonical for data continuity across APK reinstalls.
    if (stored !== CANONICAL_SESSION_ID) {
      localStorage.setItem(STORAGE_KEY, CANONICAL_SESSION_ID);
      return CANONICAL_SESSION_ID;
    }

    return CANONICAL_SESSION_ID;
  });

  // Ensure session ID is always in sync with localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== sessionId) {
      localStorage.setItem(STORAGE_KEY, sessionId);
    }
  }, [sessionId]);

  /**
   * Manually clear the session (for logout/reset scenarios)
   */
  const clearSession = () => {
    localStorage.removeItem(STORAGE_KEY);
    // Never rotate to random IDs: keep backend continuity on mobile_kael.
    setSessionId(CANONICAL_SESSION_ID);
    localStorage.setItem(STORAGE_KEY, CANONICAL_SESSION_ID);
  };

  /**
   * Manually set a specific session ID (for session restoration)
   */
  const setSession = (id: string) => {
    // Preserve canonical continuity even if callers pass a custom id.
    if (id !== CANONICAL_SESSION_ID) {
      console.warn("[SESSION] Non-canonical session ignored:", id);
    }
    setSessionId(CANONICAL_SESSION_ID);
    localStorage.setItem(STORAGE_KEY, CANONICAL_SESSION_ID);
  };

  return {
    sessionId,
    clearSession,
    setSession,
  };
}
