import { useEffect, useState } from "react";

const STORAGE_KEY = "kael_session_id";

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Hook for persistent session management.
 * Generates a session_id on first load and persists it in localStorage.
 * The session_id is used for backend continuity (memory, recall, emotional state).
 */
export function useSession() {
  const [sessionId, setSessionId] = useState<string>(() => {
    // Try to load existing session from localStorage
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return stored;
    }

    // Generate new session ID if none exists
    const newId = generateUUID();
    localStorage.setItem(STORAGE_KEY, newId);
    return newId;
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
    const newId = generateUUID();
    setSessionId(newId);
    localStorage.setItem(STORAGE_KEY, newId);
  };

  /**
   * Manually set a specific session ID (for session restoration)
   */
  const setSession = (id: string) => {
    setSessionId(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  return {
    sessionId,
    clearSession,
    setSession,
  };
}
